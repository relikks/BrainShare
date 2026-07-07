"""Validate RAM++ tags on sample images + warm per-image ingest timing."""
import pathlib
import sqlite3
import time

import modal

APP = "brainshare-embed"
con = sqlite3.connect("data/brainshare.db")
tagger = modal.Cls.from_name(APP, "ImageTagger")()
img = modal.Cls.from_name(APP, "ImageEmbedder")()
txt = modal.Cls.from_name(APP, "TextEmbedder")()


def blob(name: str) -> bytes:
    r = con.execute("select blob_key from file where name=? limit 1", (name,)).fetchone()
    return pathlib.Path("data/blobs", r[0]).read_bytes()


print("== RAM++ tags ==")
for n in ("eagle.jpg", "coral-reef.jpg", "elephant.jpg", "colosseum.jpg", "wolf.jpg"):
    tags = tagger.describe.remote([blob(n)])[0]["tags"]
    print(f"  {n:14} -> {tags[:14]}")

data = blob("eagle.jpg")


def rnd(label: str) -> None:
    print(f"== {label} ==")
    t = time.time(); tags = tagger.describe.remote([data])[0]["tags"]; a = time.time() - t
    t = time.time(); img.embed.remote([data], "image"); b = time.time() - t
    t = time.time(); txt.embed.remote([", ".join(tags) or "x"], "document"); c = time.time() - t
    print(f"  RAM++ {a:.2f}s | SigLIP {b:.2f}s | Qwen {c:.2f}s | TOTAL {a + b + c:.2f}s/img")


rnd("WARM (all models loaded)")
