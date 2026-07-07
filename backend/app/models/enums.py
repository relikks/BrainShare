from enum import StrEnum


class Modality(StrEnum):
    """File modality → drives which embedding space(s) a file fans out to."""

    text = "text"
    image = "image"
    audio = "audio"
    video = "video"


class Role(StrEnum):
    """A member's role within a collection."""

    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class FileStatus(StrEnum):
    """Lifecycle of a file's embedding pipeline."""

    pending = "pending"
    ready = "ready"
    failed = "failed"


class EntityKind(StrEnum):
    """A knowledge-graph node the user creates."""

    person = "person"
    event = "event"
    category = "category"
