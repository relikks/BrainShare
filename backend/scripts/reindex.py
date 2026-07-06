"""Re-run the ingest pipeline over existing files — the backfill tool for newly
added pipelines (e.g. image.objects) and the generic "reindex this" hammer.

Run with the backend STOPPED (embedded Qdrant is single-process):

    python scripts/reindex.py --missing image.objects   # files lacking that index
    python scripts/reindex.py --modality image          # every image
    python scripts/reindex.py --failed                  # legacy failed files
    python scripts/reindex.py --all
"""

import argparse
import asyncio

from sqlmodel import select

from app.db import _session_factory
from app.embedding import PIPELINES
from app.models import File, FileStatus, Modality
from app.pipeline import process_file


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--missing", help="pipeline key — only files without a ready index for it")
    ap.add_argument("--modality", help="only files of this modality (text/image/audio/video)")
    ap.add_argument("--failed", action="store_true", help="only files with status=failed")
    ap.add_argument("--all", action="store_true", help="everything")
    args = ap.parse_args()
    if not (args.missing or args.modality or args.failed or args.all):
        ap.error("pick one of --missing/--modality/--failed/--all")
    if args.missing and args.missing not in PIPELINES:
        ap.error(f"unknown pipeline {args.missing!r} (have: {', '.join(PIPELINES)})")

    stmt = select(File)
    if args.failed:
        stmt = stmt.where(File.status == FileStatus.failed)
    if args.modality:
        stmt = stmt.where(File.modality == Modality(args.modality))
    elif args.missing:
        stmt = stmt.where(File.modality == PIPELINES[args.missing].modality)

    async with _session_factory() as s:
        files = (await s.exec(stmt)).all()
    if args.missing:
        files = [f for f in files if (f.index_status or {}).get(args.missing) != "ready"]

    ids = [f.id for f in files]
    print(f"reindexing {len(ids)} files…")
    for i, fid in enumerate(ids, 1):
        await process_file(fid)
        print(f"  {i}/{len(ids)} {fid}")
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
