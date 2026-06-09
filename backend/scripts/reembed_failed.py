"""Re-run the pipeline for every failed file. Run with the backend STOPPED
(embedded Qdrant is single-process):

    python scripts/reembed_failed.py
"""

import asyncio

from sqlmodel import select

from app.db import _session_factory
from app.models import File, FileStatus
from app.pipeline import process_file


async def main() -> None:
    async with _session_factory() as s:
        failed = (await s.exec(select(File).where(File.status == FileStatus.failed))).all()
        ids = [f.id for f in failed]
    print(f"re-embedding {len(ids)} failed files…")
    for i, fid in enumerate(ids, 1):
        await process_file(fid)
        print(f"  {i}/{len(ids)} {fid}")
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
