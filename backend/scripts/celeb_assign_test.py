"""Verify naming + auto-pickup: name the biggest Nicolas Cage cluster once, then check
his OTHER face clusters get absorbed (no per-photo reclassify), and files link to him."""
import sys

import httpx

BACKEND = "http://127.0.0.1:8000"
H = {"Authorization": "Bearer e2c578bf-1061-4488-9879-ca1b76b0b796"}
CID = sys.argv[1]
c = httpx.Client(timeout=120, headers=H)

files = {f["id"]: f["name"] for f in c.get(f"{BACKEND}/files", params={"collection_id": CID}).json()}


def cage_faces(clusters):
    return sum(
        c_["count"] for c_ in clusters if any("cage" in files.get(f["file_id"], "") for f in c_["faces"])
    )


before = c.get(f"{BACKEND}/collections/{CID}/faces/inbox").json()
print(f"before: {len(before)} clusters, cage faces unassigned ≈ {cage_faces(before)}")

# Name the biggest Cage cluster → "Nicolas Cage".
biggest = max(
    (cl for cl in before if all("cage" in files.get(f["file_id"], "") for f in cl["faces"])),
    key=lambda cl: cl["count"],
)
person = c.post(
    f"{BACKEND}/faces/assign", json={"face_ids": biggest["face_ids"], "name": "Nicolas Cage"}
).json()
print(f"named cluster of {biggest['count']} → person {person['name']} ({person['id'][:8]})")

after = c.get(f"{BACKEND}/collections/{CID}/faces/inbox").json()
print(f"after:  {len(after)} clusters, cage faces STILL unassigned ≈ {cage_faces(after)}")

# Files now linked to Nicolas Cage:
linked = [
    files[f["id"]]
    for f in c.get(f"{BACKEND}/files", params={"collection_id": CID}).json()
    if any(e["id"] == person["id"] for e in c.get(f"{BACKEND}/files/{f['id']}/entities").json())
]
print(f"files linked to Nicolas Cage: {sorted(linked)}")
