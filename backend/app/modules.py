"""Per-collection AI modules.

A *module* is a toggleable processing capability the indexing pipeline can run on a
collection's files — embed a modality, transcribe speech, OCR images, … Defaults live
here; a collection overrides them via `Collection.modules` (a JSON name→bool map). The
pipeline gates each step on the effective config (`effective_modules`), so turning a
module off skips that work (and its vectors) for that collection.

Adding a new model index later = add an entry here + honor it in pipeline/runner.
"""

from __future__ import annotations

from .models import Collection

# name -> metadata. `default` is the enabled state when a collection hasn't overridden it.
MODULES: dict[str, dict] = {
    "image": {
        "default": True,
        "label": "Image embedding",
        "desc": "Index images for visual + text-to-image search (SigLIP 2).",
        "modalities": ["image", "video"],
    },
    "audio": {
        "default": True,
        "label": "Audio embedding",
        "desc": "Index audio for sound-similarity search (CLAP).",
        "modalities": ["audio", "video"],
    },
    "video": {
        "default": True,
        "label": "Video embedding",
        "desc": "Index video frames for temporal search (X-CLIP).",
        "modalities": ["video"],
    },
    "transcription": {
        "default": True,
        "label": "Transcription",
        "desc": "Transcribe speech in audio/video to searchable text (Whisper).",
        "modalities": ["audio", "video"],
    },
    "objects": {
        "default": True,
        "label": "Object detection",
        "desc": "Detect objects (RAM++) for object-level image search.",
        "modalities": ["image"],
    },
    "faces": {
        "default": True,
        "label": "Face detection",
        "desc": "Detect and embed faces (InsightFace) to find and group people.",
        "modalities": ["image"],
    },
    "ocr": {
        "default": False,
        "label": "OCR (image → text)",
        "desc": "Extract written text from images for full-text search. (Coming soon.)",
        "modalities": ["image"],
    },
}


def effective_modules(coll: Collection | None) -> dict[str, bool]:
    """The defaults merged with the collection's (validated) overrides."""
    cfg = {name: meta["default"] for name, meta in MODULES.items()}
    overrides = (coll.modules if coll else None) or {}
    for name, value in overrides.items():
        if name in cfg and isinstance(value, bool):
            cfg[name] = value
    return cfg


def module_on(coll: Collection | None, name: str) -> bool:
    """Is `name` enabled for this collection? Unknown modules are off."""
    return effective_modules(coll).get(name, False)
