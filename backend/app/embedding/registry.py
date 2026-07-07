"""Single source of truth for embedding spaces, search pipelines, and modality routing.

A *space* is one Qdrant collection (one vector geometry). A *file* fans out to
one or more spaces; a *query* for a given modality searches exactly the spaces
that modality's files write to. Model ids/dims are config-driven so the Modal
layer can be re-pointed without touching call sites.

A *pipeline* is one named way of searching one file type: the space it queries,
the text tower that encodes the NL query into that space, and the ingest module
(app/modules.py) that must have run at upload time for its index to exist. The
same index can back several pipelines (SigLIP's two towers), and several
pipelines can share a query encoder (transcript/objects/text all ride Qwen3 —
one Modal call covers them). Statically defined for now; per-collection
enablement comes from the module system.
"""

from dataclasses import dataclass

from ..models import Modality


@dataclass(frozen=True)
class Space:
    name: str
    model_id: str
    dim: int  # expected vector size; Qdrant collections are still created lazily
    modal_fn: str  # Modal function name that produces vectors for this space


# SOTA, open-weight, Modal-hosted. dims are model defaults (lazy-created anyway).
SPACES: dict[str, Space] = {
    "text": Space("text", "Qwen/Qwen3-Embedding-4B", 2560, "embed_text"),
    "image": Space("image", "google/siglip2-so400m-patch16-naflex", 1152, "embed_image"),
    "audio": Space("audio", "wavlink/wavlink-base", 512, "embed_audio"),
    "video": Space("video", "microsoft/xclip-base-patch32", 512, "embed_video"),
    # RAM++ tags, embedded with the text model (object-level image search).
    "image_objects": Space("image_objects", "Qwen/Qwen3-Embedding-4B", 2560, "embed_text"),
    # Per-face ArcFace embeddings (InsightFace) — many points per image, one per face.
    # Not in MODALITY_SPACES: searched by-example (a face), not by NL query.
    "face": Space("face", "insightface/buffalo_l", 512, "detect_faces"),
}

# Where a FILE of each modality writes its vectors (text = transcript for a/v).
MODALITY_SPACES: dict[Modality, tuple[str, ...]] = {
    Modality.text: ("text",),
    Modality.image: ("image", "image_objects"),
    Modality.audio: ("audio", "text"),
    Modality.video: ("video", "audio", "text"),
}


def spaces_for_modalities(modalities: list[Modality]) -> list[str]:
    """Spaces a query must hit to cover the selected modalities (order-stable)."""
    seen: list[str] = []
    for m in modalities:
        for s in MODALITY_SPACES[m]:
            if s not in seen:
                seen.append(s)
    return seen


@dataclass(frozen=True)
class Pipeline:
    key: str  # "image.objects"
    label: str
    desc: str
    modality: Modality  # the file type this pipeline finds
    space: str  # Qdrant space it searches
    query_space: str  # whose text tower encodes the NL query ("text" = Qwen3)
    module: str | None  # ingest module prerequisite (app/modules.py); None = always on


PIPELINES: dict[str, Pipeline] = {
    p.key: p
    for p in (
        Pipeline(
            "text.semantic", "Semantic", "Meaning-level match on the text itself.",
            Modality.text, "text", "text", None,
        ),
        Pipeline(
            "image.description", "Description", "Text-to-image: describe what the image shows (SigLIP 2).",
            Modality.image, "image", "image", "image",
        ),
        Pipeline(
            "image.objects", "Objects", "Fuzzy match on objects detected in the image (RAM++ tags).",
            Modality.image, "image_objects", "text", "objects",
        ),
        Pipeline(
            "audio.sound", "Sound", "Match the sound itself — timbre, mood, events (CLAP).",
            Modality.audio, "audio", "audio", "audio",
        ),
        Pipeline(
            "audio.transcript", "Transcript", "Match what was said (Whisper transcript, semantic).",
            Modality.audio, "text", "text", "transcription",
        ),
        Pipeline(
            "video.visual", "Visual", "Match what the frames show (X-CLIP).",
            Modality.video, "video", "video", "video",
        ),
        Pipeline(
            "video.soundtrack", "Soundtrack", "Match the audio track's sound (CLAP).",
            Modality.video, "audio", "audio", "audio",
        ),
        Pipeline(
            "video.transcript", "Transcript", "Match what was said (Whisper transcript, semantic).",
            Modality.video, "text", "text", "transcription",
        ),
    )
}


def pipelines_for_modalities(modalities: list[Modality]) -> list[Pipeline]:
    """Default pipeline set when a query names only modalities (legacy behaviour:
    every way of searching each selected type). Order-stable."""
    return [p for p in PIPELINES.values() if p.modality in modalities]
