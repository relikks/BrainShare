"""BrainShare embedding service on Modal.

Four GPU model classes — one per SOTA, open-weight embedder — each autoscaling to
zero (`min_containers=0`) and warmed briefly (`scaledown_window`). Deploying all
four costs nothing until a class is first called; you pay only for the modalities
actually used. Weights are cached in a Modal Volume so cold starts re-use them.

    modal deploy app.py

Model ids are constants below — swap freely (e.g. text 0.6B ↔ 4B) without touching
the BrainShare backend, which calls these by class name.
"""

from __future__ import annotations

import io

import modal

# ── Models (open-weight, HF) ──────────────────────────────────────────────────
TEXT_MODEL = "Qwen/Qwen3-Embedding-4B"  # balanced SOTA tier (knee of the curve)
IMAGE_MODEL = "google/siglip2-so400m-patch14-384"  # SO400M — near image-retrieval ceiling
AUDIO_MODEL = "laion/clap-htsat-unfused"  # WavLink target once weights are public
VIDEO_MODEL = "microsoft/xclip-base-patch32"
WHISPER_MODEL = "base"  # faster-whisper size for transcripts
TAGGER_MODEL = "microsoft/Florence-2-large"  # caption + object tags (objects pipeline)

app = modal.App("brainshare-embed")

_cache = modal.Volume.from_name("brainshare-hf-cache", create_if_missing=True)
CACHE = "/cache"
_env = {"HF_HOME": CACHE, "HF_HUB_ENABLE_HF_TRANSFER": "1"}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "transformers>=4.49",
        "sentence-transformers>=3.3",
        "pillow",
        "soundfile",
        "librosa",
        "av",
        "faster-whisper",
        "nvidia-cublas-cu12",  # so CTranslate2 (Whisper) can run on GPU
        "nvidia-cudnn-cu12",
        "hf-transfer",
        "numpy",
        "einops",  # Florence-2 remote code
        "timm",  # Florence-2 vision tower
    )
    .env(_env)
)


def _to_tensor(out):
    """Coerce a HF get_*_features result (tensor or ModelOutput) to a tensor."""
    import torch

    if torch.is_tensor(out):
        return out
    for attr in ("image_embeds", "text_embeds", "audio_embeds", "video_embeds", "pooler_output"):
        v = getattr(out, attr, None)
        if torch.is_tensor(v):
            return v
    lhs = getattr(out, "last_hidden_state", None)
    if torch.is_tensor(lhs):
        return lhs.mean(dim=1) if lhs.dim() == 3 else lhs
    raise TypeError(f"no tensor embedding in {type(out).__name__}")


def _l2norm(t):
    import torch.nn.functional as F

    return F.normalize(_to_tensor(t), p=2, dim=-1)


# ── Text: Qwen3-Embedding (text files, transcripts, text query) ───────────────
@app.cls(gpu="L4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=300, min_containers=0)
class TextEmbedder:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from sentence_transformers import SentenceTransformer

        # Loaded straight onto GPU inside the snapshotted step → GPU snapshot
        # captures the VRAM-resident model so cold starts restore it directly.
        self.model = SentenceTransformer(
            TEXT_MODEL, device="cuda", model_kwargs={"torch_dtype": torch.float16}
        )

    @modal.method()
    def embed(self, texts: list[str], mode: str = "document") -> list[list[float]]:
        kw = {"prompt_name": "query"} if mode == "query" else {}
        embs = self.model.encode(
            texts, normalize_embeddings=True, convert_to_numpy=True, **kw
        )
        return embs.tolist()


# ── Image: SigLIP 2 (image files; text tower for image query) ─────────────────
@app.cls(gpu="L4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=300, min_containers=0)
class ImageEmbedder:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from transformers import AutoModel, AutoProcessor

        self.torch = torch
        self.proc = AutoProcessor.from_pretrained(IMAGE_MODEL)
        self.model = AutoModel.from_pretrained(IMAGE_MODEL).to("cuda").eval()

    @modal.method()
    def embed(self, items: list, mode: str = "image") -> list[list[float]]:
        from PIL import Image

        with self.torch.no_grad():
            if mode == "text":
                inputs = self.proc(
                    text=items, padding="max_length", truncation=True, return_tensors="pt"
                ).to("cuda")
                feats = self.model.get_text_features(**inputs)
            else:
                imgs = [Image.open(io.BytesIO(b)).convert("RGB") for b in items]
                inputs = self.proc(images=imgs, return_tensors="pt").to("cuda")
                feats = self.model.get_image_features(**inputs)
            return _l2norm(feats).cpu().tolist()


# ── Audio: CLAP (+ Whisper transcript) ────────────────────────────────────────
@app.cls(gpu="T4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=300, min_containers=0)
class AudioEmbedder:
    @modal.enter(snap=True)
    def load(self):
        import ctypes
        import glob
        import os

        import torch
        from faster_whisper import WhisperModel
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.proc = ClapProcessor.from_pretrained(AUDIO_MODEL)
        self.model = ClapModel.from_pretrained(AUDIO_MODEL).to("cuda").eval()
        # Make CTranslate2 (faster-whisper) find cuBLAS/cuDNN so Whisper runs on GPU:
        # preload the .so files shipped by the nvidia-*-cu12 wheels (path-agnostic).
        for mod in ("nvidia.cublas.lib", "nvidia.cudnn.lib"):
            try:
                d = os.path.dirname(__import__(mod, fromlist=["x"]).__file__)
                for so in glob.glob(os.path.join(d, "*.so*")):
                    try:
                        ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
                    except OSError:
                        pass
            except Exception:
                pass
        self.asr = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")

    def _decode(self, b: bytes):
        import librosa

        y, _ = librosa.load(io.BytesIO(b), sr=48000, mono=True)
        return y

    @modal.method()
    def embed(self, items: list, mode: str = "audio") -> list[list[float]]:
        with self.torch.no_grad():
            if mode == "text":
                inputs = self.proc(text=items, padding=True, return_tensors="pt").to("cuda")
                feats = self.model.get_text_features(**inputs)
            else:
                audios = [self._decode(b) for b in items]
                inputs = self.proc(
                    audio=audios, sampling_rate=48000, return_tensors="pt", padding=True
                ).to("cuda")
                feats = self.model.get_audio_features(**inputs)
            return _l2norm(feats).cpu().tolist()

    @modal.method()
    def transcribe(self, clip: bytes) -> str:
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".bin") as fh:
            fh.write(clip)
            fh.flush()
            segments, _ = self.asr.transcribe(fh.name)
            return " ".join(s.text for s in segments).strip()


# ── Video: X-CLIP (temporal; text tower for video query) ──────────────────────
@app.cls(gpu="T4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=300, min_containers=0)
class VideoEmbedder:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from transformers import AutoModel, AutoProcessor

        self.torch = torch
        self.proc = AutoProcessor.from_pretrained(VIDEO_MODEL)
        self.model = AutoModel.from_pretrained(VIDEO_MODEL).to("cuda").eval()

    def _frames(self, b: bytes, n: int = 8):
        import av
        import numpy as np

        container = av.open(io.BytesIO(b))
        stream = container.streams.video[0]
        total = stream.frames or 0
        frames = [f.to_ndarray(format="rgb24") for f in container.decode(video=0)]
        if not frames:
            raise ValueError("no video frames")
        idx = np.linspace(0, len(frames) - 1, num=min(n, len(frames))).astype(int)
        picked = [frames[i] for i in idx]
        while len(picked) < n:  # pad short clips
            picked.append(picked[-1])
        return picked

    @modal.method()
    def embed(self, items: list, mode: str = "video") -> list[list[float]]:
        with self.torch.no_grad():
            if mode == "text":
                inputs = self.proc(text=items, padding=True, return_tensors="pt").to("cuda")
                feats = self.model.get_text_features(**inputs)
            else:
                videos = [self._frames(b) for b in items]
                inputs = self.proc(videos=videos, return_tensors="pt").to("cuda")
                feats = self.model.get_video_features(**inputs)
            return _l2norm(feats).cpu().tolist()


# ── Image tagger: Florence-2 (caption + object tags → the objects pipeline) ───
# Own image: Florence-2's remote code breaks on transformers ≥4.52 (missing
# forced_bos_token_id) — pin 4.51.3 here without touching the other embedders.
tagger_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch",
        "transformers==4.51.3",
        "pillow",
        "einops",
        "timm",
        "hf-transfer",
        "numpy",
    )
    .env(_env)
)


@app.cls(gpu="T4", image=tagger_image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=300, min_containers=0)
class ImageTagger:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor

        self.torch = torch
        self.proc = AutoProcessor.from_pretrained(TAGGER_MODEL, trust_remote_code=True)
        self.model = (
            AutoModelForCausalLM.from_pretrained(
                TAGGER_MODEL, torch_dtype=torch.float16, trust_remote_code=True
            )
            .to("cuda")
            .eval()
        )

    def _run(self, img, task: str) -> dict:
        inputs = self.proc(text=task, images=img, return_tensors="pt")
        inputs = {
            k: v.to("cuda", self.torch.float16) if v.dtype.is_floating_point else v.to("cuda")
            for k, v in inputs.items()
        }
        with self.torch.no_grad():
            ids = self.model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=256,
                num_beams=3,
                do_sample=False,
            )
        text = self.proc.batch_decode(ids, skip_special_tokens=False)[0]
        return self.proc.post_process_generation(text, task=task, image_size=(img.width, img.height))

    @modal.method()
    def describe(self, images: list[bytes]) -> list[dict]:
        """[{caption, tags}] — a detailed caption plus deduped object labels per image."""
        from PIL import Image

        out = []
        for b in images:
            img = Image.open(io.BytesIO(b)).convert("RGB")
            caption = (self._run(img, "<MORE_DETAILED_CAPTION>").get("<MORE_DETAILED_CAPTION>") or "").strip()
            od = self._run(img, "<OD>").get("<OD>") or {}
            labels = od.get("labels") or []
            tags = sorted({label.strip().lower() for label in labels if label and label.strip()})
            out.append({"caption": caption, "tags": tags})
        return out
