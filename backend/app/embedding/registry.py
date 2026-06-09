"""Single source of truth for embedding spaces and modality routing.

A *space* is one Qdrant collection (one vector geometry). A *file* fans out to
one or more spaces; a *query* for a given modality searches exactly the spaces
that modality's files write to. Model ids/dims are config-driven so the Modal
layer can be re-pointed without touching call sites.
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
}

# Where a FILE of each modality writes its vectors (text = transcript for a/v).
MODALITY_SPACES: dict[Modality, tuple[str, ...]] = {
    Modality.text: ("text",),
    Modality.image: ("image",),
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
