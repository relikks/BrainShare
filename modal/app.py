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

# Abstract / scene concepts YOLOE can't box (settings, landmarks, media type, mood).
# SigLIP2 scores each image against these zero-shot → tags that complement the object
# boxes so search recall keeps galaxy / landmark / drawing / sunset etc.
SCENE_CONCEPTS = [
    "indoor scene", "outdoor scene", "landscape", "cityscape", "nature", "beach", "forest",
    "mountains", "desert", "ocean", "underwater", "sky", "space", "galaxy", "night sky",
    "sunset", "sunrise", "snow", "rain", "fog", "landmark", "monument", "architecture",
    "building", "street", "park", "garden", "room interior", "kitchen", "office", "restaurant",
    "stadium", "museum", "church", "bridge", "portrait", "group photo", "selfie", "aerial view",
    "close-up", "macro photo", "black and white photo", "drawing", "illustration", "painting",
    "sketch", "diagram", "screenshot", "map", "chart", "document", "colorful", "dark", "bright",
    "vintage", "minimalist", "abstract", "wedding", "party", "concert", "sports event", "travel",
    "food", "winter", "summer", "autumn", "spring", "daytime", "nighttime",
]

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
@app.cls(gpu="L4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=180, min_containers=0)
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
@app.cls(gpu="L4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=180, min_containers=0)
class ImageEmbedder:
    @modal.enter(snap=True)
    def load(self):
        import torch
        from transformers import AutoModel, AutoProcessor

        self.torch = torch
        self.proc = AutoProcessor.from_pretrained(IMAGE_MODEL)
        self.model = AutoModel.from_pretrained(IMAGE_MODEL).to("cuda").eval()
        # Precompute the scene-concept text bank once → zero-shot tagging is a single
        # matmul at ingest. Captured in the snapshot alongside the model.
        self.scene_concepts = SCENE_CONCEPTS
        prompts = [f"a photo of {c}" for c in SCENE_CONCEPTS]
        with torch.no_grad():
            inp = self.proc(
                text=prompts, padding="max_length", truncation=True, return_tensors="pt"
            ).to("cuda")
            self.scene_feats = _l2norm(self.model.get_text_features(**inp))

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

    @modal.method()
    def scene_tags(self, images: list[bytes], top_k: int = 3, thresh: float = 0.0) -> list[list[str]]:
        """Zero-shot abstract/scene tags per image. SigLIP2 is sigmoid-trained so absolute
        scores are tiny and hard to threshold across images — the RANKING is what's
        reliable, so we take the top-k most-likely concepts (optionally floored by a
        calibrated sigmoid prob). Complements YOLOE's object boxes."""
        from PIL import Image

        with self.torch.no_grad():
            imgs = [Image.open(io.BytesIO(b)).convert("RGB") for b in images]
            inputs = self.proc(images=imgs, return_tensors="pt").to("cuda")
            feats = _l2norm(self.model.get_image_features(**inputs))
            sims = feats @ self.scene_feats.T
            scale = self.model.logit_scale.exp()
            probs = (sims * scale + self.model.logit_bias).sigmoid()
            out = []
            for row in probs:
                k = min(top_k, row.shape[-1])
                vals, idx = row.topk(k)
                out.append(
                    [self.scene_concepts[i] for v, i in zip(vals.tolist(), idx.tolist()) if v >= thresh]
                )
            return out


# ── Audio: CLAP (+ Whisper transcript) ────────────────────────────────────────
@app.cls(gpu="T4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=180, min_containers=0)
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
@app.cls(gpu="T4", image=image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=180, min_containers=0)
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


# ── Image tagger: RAM++ (open-vocab object tags → the objects pipeline) ───────
# RAM++ (Recognize Anything Plus) — a dedicated SOTA image tagger over a
# ~4.5k open-vocabulary tag set. One Swin-L forward pass per image (no autoregressive
# generation — much cheaper than Florence's caption). Tags only, no caption.
RAM_REPO = "xinyu1205/recognize-anything-plus-model"
RAM_CKPT = "ram_plus_swin_large_14m.pth"

tagger_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .pip_install(
        "torch",
        "torchvision",
        # RAM's vendored BERT imports helpers from transformers.modeling_utils that
        # newer transformers (≥4.49) removed — pin to a version that still exports them.
        "transformers==4.40.2",
        "timm==0.9.16",
        "pillow",
        "scipy",  # RAM tag inference
        "fairscale",  # RAM's checkpoint_wrapper
        "huggingface-hub",
        "numpy<2",
        "git+https://github.com/xinyu1205/recognize-anything.git",
    )
    # HF's Xet backend writes transient log files into the cache Volume during load;
    # they break Modal's snapshot restore (9p walk → exit 128). Disable Xet here.
    .env({"HF_HOME": CACHE, "HF_HUB_DISABLE_XET": "1"})
)


# Memory + GPU snapshot re-enabled now that HF_HUB_DISABLE_XET=1 stops the Xet cache
# writes that broke snapshot restore — cold starts restore RAM++ from the snapshot in
# seconds instead of reloading Swin-L weights.
@app.cls(gpu="T4", image=tagger_image, volumes={CACHE: _cache}, enable_memory_snapshot=True, experimental_options={"enable_gpu_snapshot": True}, scaledown_window=180, min_containers=0)
class ImageTagger:
    @modal.enter(snap=True)
    def load(self):
        import torch

        # RAM's vendored BERT imports these from transformers.modeling_utils, but modern
        # transformers moved them to pytorch_utils — shim them back so the import works.
        import transformers.modeling_utils as _mu
        from transformers import pytorch_utils as _pu

        for _name in ("apply_chunking_to_forward", "find_pruneable_heads_and_indices", "prune_linear_layer"):
            if not hasattr(_mu, _name) and hasattr(_pu, _name):
                setattr(_mu, _name, getattr(_pu, _name))

        from huggingface_hub import hf_hub_download
        from ram import get_transform
        from ram.models import ram_plus

        self.torch = torch
        ckpt = hf_hub_download(RAM_REPO, RAM_CKPT, cache_dir=CACHE)
        self.transform = get_transform(image_size=384)
        self.model = ram_plus(pretrained=ckpt, image_size=384, vit="swin_l").eval().to("cuda")

    @modal.method()
    def describe(self, images: list[bytes]) -> list[dict]:
        """[{caption, tags}] — RAM++ open-vocab tags per image. caption kept empty for
        interface compatibility (Florence's caption was dropped)."""
        from PIL import Image
        from ram import inference_ram

        out = []
        for b in images:
            img = self.transform(Image.open(io.BytesIO(b)).convert("RGB")).unsqueeze(0).to("cuda")
            with self.torch.no_grad():
                res = inference_ram(img, self.model)
            english = res[0] if isinstance(res, (tuple, list)) else res
            tags = sorted({t.strip().lower() for t in str(english).split("|") if t.strip()})
            out.append({"caption": "", "tags": tags})
        return out


# ── Faces: InsightFace (detection + ArcFace embeddings → the people graph) ─────
# Own image (onnxruntime, no transformers). Models (~300MB, buffalo_l pack) cache
# in the Volume. No memory snapshot — onnxruntime + small models cold-load fast.
face_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0")  # opencv runtime libs
    .pip_install(
        "insightface",
        "onnxruntime-gpu",
        "opencv-python-headless",
        "pillow",
        "numpy<2",
        "hf-transfer",
        "huggingface-hub",
    )
    .env({"INSIGHTFACE_HOME": CACHE, "HF_HOME": CACHE})
)


@app.cls(gpu="T4", image=face_image, volumes={CACHE: _cache}, scaledown_window=180, min_containers=0)
class FaceDetector:
    @modal.enter()
    def load(self):
        from insightface.app import FaceAnalysis

        self.app = FaceAnalysis(
            name="buffalo_l",
            root=CACHE,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=0, det_size=(640, 640))

    @modal.method()
    def detect(self, images: list[bytes]) -> list[list[dict]]:
        """Per image → [{bbox:[x1,y1,x2,y2], score, embedding:[512]}] (normed ArcFace).
        The embeddings feed the per-face vector space; the boxes let the UI highlight
        and, later, cluster + name people."""
        import cv2
        import numpy as np

        out = []
        for b in images:
            arr = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
            if arr is None:
                out.append([])
                continue
            faces = self.app.get(arr)
            out.append(
                [
                    {
                        "bbox": [float(x) for x in f.bbox.tolist()],
                        "score": float(f.det_score),
                        "embedding": [float(x) for x in f.normed_embedding.tolist()],
                    }
                    for f in faces
                    if float(f.det_score) >= 0.5
                ]
            )
        return out


# ── Objects: YOLOE (open-vocab, prompt-free = "detect everything") ────────────
# Replaces RAM++ for the objects pipeline: exhaustive open-set detection with BOXES
# (and masks — seg variant), so we can search "photos with a <thing>" AND highlight
# where it is. Prompt-free weights carry an internal LVIS+Objects365 vocabulary.
# Small + own repo deps (no transformers pin) → slots into the consolidated stack.
yolo_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("ultralytics", "pillow", "numpy<2", "hf-transfer", "huggingface-hub")
    .env({"HF_HOME": CACHE, "YOLO_CONFIG_DIR": "/tmp/ultra"})
)

YOLOE_WEIGHTS = "yoloe-11l-seg-pf.pt"  # 11-large, segmentation, prompt-free


@app.cls(gpu="T4", image=yolo_image, volumes={CACHE: _cache}, scaledown_window=180, min_containers=0)
class ObjectDetector:
    @modal.enter()
    def load(self):
        import os

        from ultralytics import YOLOE

        os.makedirs(f"{CACHE}/yoloe", exist_ok=True)
        os.chdir(f"{CACHE}/yoloe")  # weights download here → cached in the Volume
        self.model = YOLOE(YOLOE_WEIGHTS)
        self.model.to("cuda")

    @modal.method()
    def detect(self, images: list[bytes], conf: float = 0.25, with_masks: bool = False) -> list[list[dict]]:
        """Per image → [{label, bbox:[x1,y1,x2,y2], score}] over everything YOLOE sees
        (prompt-free). bbox in pixel coords, same convention as faces."""
        from PIL import Image

        out = []
        for b in images:
            img = Image.open(io.BytesIO(b)).convert("RGB")
            res = self.model.predict(img, conf=conf, device=0, verbose=False)[0]
            names = res.names
            dets = []
            for box in res.boxes:
                cls = int(box.cls[0])
                dets.append(
                    {
                        "label": str(names.get(cls, cls)).lower(),
                        "bbox": [float(v) for v in box.xyxy[0].tolist()],
                        "score": float(box.conf[0]),
                    }
                )
            out.append(dets)
        return out
