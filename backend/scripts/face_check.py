"""Smoke test: InsightFace face detection on corpus images."""
import pathlib
import sqlite3

import modal

con = sqlite3.connect("data/brainshare.db")
det = modal.Cls.from_name("brainshare-embed", "FaceDetector")()

names = [r[0] for r in con.execute(
    "select name from file where modality='image' order by name"
).fetchall()]
print(f"{len(names)} images; probing for faces…")
for name in names:
    blob = con.execute("select blob_key from file where name=? limit 1", (name,)).fetchone()[0]
    data = pathlib.Path("data/blobs", blob).read_bytes()
    faces = det.detect.remote([data])[0]
    if faces:
        boxes = [[round(x) for x in f["bbox"]] for f in faces]
        print(f"  {name:22} {len(faces)} face(s)  dim={len(faces[0]['embedding'])}  boxes={boxes}")
