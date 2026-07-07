"""Smoke test: per-image ingest timing, cold (models scaled to zero) then warm.

Times the three Modal calls an image ingest makes — RAM++ tags, SigLIP embed,
Qwen embed of the tags — end to end, twice: the first round pays cold starts,
the second is warm. Run in the backend dir with env loaded:

    set -a && . ./.env && set +a && .venv/bin/python scripts/ingest_timing.py
"""

import sqlite3
import pathlib
import time

import modal

APP = "brainshare-embed"


def _img_bytes(n: int = 1) -> list[bytes]:
    con = sqlite3.connect("data/brainshare.db")
    rows = con.execute("select blob_key from file where modality='image' limit ?", (n,)).fetchall()
    return [pathlib.Path("data/blobs", k).read_bytes() for (k,) in rows]


def _round(label: str, imgs: list[bytes]) -> None:
    tagger = modal.Cls.from_name(APP, "ImageTagger")()
    img_emb = modal.Cls.from_name(APP, "ImageEmbedder")()
    txt = modal.Cls.from_name(APP, "TextEmbedder")()

    print(f"\n== {label} ({len(imgs)} image(s)) ==")
    t0 = time.time()
    descs = tagger.describe.remote(imgs)
    t_tag = time.time() - t0
    tags = descs[0].get("tags", [])
    print(f"  RAM++ tags        {t_tag:6.1f}s   → {tags[:12]}")

    t0 = time.time()
    img_emb.embed.remote(imgs, "image")
    t_img = time.time() - t0
    print(f"  SigLIP embed      {t_img:6.1f}s")

    doc = ", ".join(tags) or "empty"
    t0 = time.time()
    txt.embed.remote([doc], "document")
    t_txt = time.time() - t0
    print(f"  Qwen embed(tags)  {t_txt:6.1f}s")

    print(f"  ── total ingest   {t_tag + t_img + t_txt:6.1f}s / image")


def main() -> None:
    imgs = _img_bytes(1)
    if not imgs:
        print("no image in corpus")
        return
    _round("COLD (models were scaled to zero)", imgs)
    _round("WARM (models already loaded)", imgs)


if __name__ == "__main__":
    main()
