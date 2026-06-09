from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models import Directory


async def get(session: AsyncSession, collection_id: str, dir_id: str) -> Directory:
    d = await session.get(Directory, dir_id)
    if d is None or d.collection_id != collection_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Directory not found")
    return d


async def create_directory(
    session: AsyncSession, collection_id: str, parent_id: str | None, name: str
) -> Directory:
    parent = None
    if parent_id:
        parent = await get(session, collection_id, parent_id)
    d = Directory(collection_id=collection_id, parent_id=parent_id, name=name)
    base = parent.path if parent else ""
    d.path = base.rstrip("/") + "/" + name
    d.ancestor_ids = (parent.ancestor_ids if parent else []) + [d.id]
    session.add(d)
    await session.commit()
    await session.refresh(d)
    return d


async def list_children(
    session: AsyncSession, collection_id: str, parent_id: str | None
) -> list[Directory]:
    res = await session.exec(
        select(Directory)
        .where(Directory.collection_id == collection_id, Directory.parent_id == parent_id)
        .order_by(Directory.name)
    )
    return list(res.all())


async def breadcrumb(
    session: AsyncSession, collection_name: str, directory: Directory | None
) -> list[dict]:
    """[{id:None, name: collection}, {id, name}, …] root→current (inclusive)."""
    crumbs: list[dict] = [{"id": None, "name": collection_name}]
    if directory is None:
        return crumbs
    rows = {
        d.id: d
        for d in (
            await session.exec(
                select(Directory).where(Directory.id.in_(directory.ancestor_ids))  # type: ignore[attr-defined]
            )
        ).all()
    }
    for did in directory.ancestor_ids:  # already root→self order
        d = rows.get(did)
        if d:
            crumbs.append({"id": d.id, "name": d.name})
    return crumbs
