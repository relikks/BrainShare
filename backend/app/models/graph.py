"""The personal knowledge graph: user-created entities (people, events, categories),
file↔entity links, and detected faces (that resolve to person entities).

All user-scoped and consent-based — entities exist only over the user's own content;
nothing here identifies strangers or pulls external data.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from .entities import new_id, utcnow
from .enums import EntityKind


class Entity(SQLModel, table=True):
    """A node the user creates: a person, an event, or a category. Files link to these
    to build the knowledge base; faces/speakers get assigned to person entities."""

    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="user.id", index=True)
    kind: EntityKind = Field(index=True)
    name: str
    # Free-form: event date/place, category colour, etc.
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class FileEntity(SQLModel, table=True):
    """Many-to-many link: a file is associated with a person / event / category."""

    __table_args__ = (UniqueConstraint("file_id", "entity_id", name="uq_file_entity"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    file_id: str = Field(foreign_key="file.id", index=True)
    entity_id: str = Field(foreign_key="entity.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Face(SQLModel, table=True):
    """A detected face: its box on a file, the Qdrant point holding its ArcFace vector,
    and the person it was assigned to (null = unnamed → sits in the collection's inbox)."""

    id: str = Field(default_factory=new_id, primary_key=True)
    file_id: str = Field(foreign_key="file.id", index=True)
    collection_id: str = Field(foreign_key="collection.id", index=True)
    point_id: str = Field(index=True)  # id of the point in the `face` Qdrant space
    bbox: list = Field(default_factory=list, sa_column=Column(JSON))
    score: float = 0.0
    person_id: str | None = Field(default=None, foreign_key="entity.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
