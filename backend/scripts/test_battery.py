"""A battery of searches that exercise the pipeline: text semantics, cross-modal
text→image, combined modalities, directory-subtree scoping, and disambiguation.
Judges each by whether the expected file lands in the top-1 / top-3.

    python scripts/test_battery.py <backend> <uuid>
"""

import sys

import httpx

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
UUID = sys.argv[2]
H = {"Authorization": f"Bearer {UUID}"}
c = httpx.Client(timeout=120, headers=H)


def kb_id() -> str:
    cols = c.get(f"{B}/collections").json()
    return next(x["id"] for x in cols if x["name"] == "Knowledge Base")


def dir_map(cid: str) -> dict[str, str]:
    """{'Theme': id, 'Theme/Sub': id} for scoped tests."""
    m: dict[str, str] = {}
    root = c.get(f"{B}/collections/{cid}/browse").json()
    for t in root["directories"]:
        m[t["name"]] = t["id"]
        sub = c.get(f"{B}/collections/{cid}/browse", params={"directory_id": t["id"]}).json()
        for s in sub["directories"]:
            m[f"{t['name']}/{s['name']}"] = s["id"]
    return m


def search(query, modalities, cid, directory_id=None, top_k=3):
    body = {"query": query, "modalities": modalities, "collection_ids": [cid], "top_k": top_k}
    if directory_id:
        body["directory_id"] = directory_id
        body["include_subdirs"] = True
    return c.post(f"{B}/search", json=body).json()["hits"]


def main():
    cid = kb_id()
    dirs = dir_map(cid)
    # corpus has only text+image with real data, so keep the battery to those two
    # spaces (avoids cold-starting CLAP/X-CLIP for ~no signal).
    ALL = ["text", "image"]

    # (group, description, query, modalities, scope_dir_name, expected_stems)
    CASES = [
        # A — text semantics (little/no keyword overlap with the document)
        ("TEXT", "infrasound long-distance communication", "which animal communicates over long distances using low-frequency sound", ["text"], None, ["african-elephant"]),
        ("TEXT", "electroreception predator fish", "a predatory fish that senses prey using electric fields", ["text"], None, ["great-white-shark"]),
        ("TEXT", "galaxy collision with Milky Way", "the nearest spiral galaxy that will one day collide with ours", ["text"], None, ["andromeda-galaxy"]),
        ("TEXT", "first moon walk", "the first humans to set foot on the Moon", ["text"], None, ["apollo-11"]),
        ("TEXT", "whole-half step pattern", "the seven-note pattern of whole and half steps in western music", ["text"], None, ["major-scale"]),
        ("TEXT", "marble mausoleum for a wife", "a white marble tomb a Mughal emperor built for his late wife", ["text"], None, ["taj-mahal"]),
        ("TEXT", "spinning neutron star beams", "a fast-spinning collapsed star that sweeps beams like a lighthouse", ["text"], None, ["pulsar"]),
        ("TEXT", "canyon carved by river", "a mile-deep gorge cut by a river exposing ancient rock layers", ["text"], None, ["grand-canyon"]),
        # B — cross-modal text → image
        ("X-MODAL", "grey animal with trunk → img", "a large grey animal with a long trunk", ["image"], None, ["elephant"]),
        ("X-MODAL", "northern lights → img", "the colourful northern lights in the night sky", ["image"], None, ["aurora"]),
        ("X-MODAL", "iron lattice tower → img", "a tall iron lattice tower", ["image"], None, ["eiffel"]),
        ("X-MODAL", "six-string instrument → img", "a wooden six-stringed instrument", ["image"], None, ["guitar"]),
        ("X-MODAL", "roman amphitheatre → img", "an ancient ruined roman amphitheatre", ["image"], None, ["colosseum"]),
        ("X-MODAL", "spiral galaxy → img", "a spiral galaxy of stars in deep space", ["image"], None, ["spiral-galaxy", "andromeda"]),
        # C — combined modalities (text + image should both surface a topic)
        ("COMBINED", "whale across modalities", "humpback whale", ALL, None, ["humpback-whale", "whale"]),
        ("COMBINED", "violin across modalities", "violin", ALL, None, ["violin"]),
        # D — directory-subtree scoping
        ("SCOPED", "bright sky object — Space only", "a bright object glowing in the sky", ["text", "image"], "Space & Astronomy", ["aurora", "spiral-galaxy", "nebula", "pulsar", "saturn", "andromeda"]),
        ("SCOPED", "instrument — Strings folder only", "an instrument you play with your hands", ["text", "image"], "Music & Instruments/Strings", ["violin", "guitar", "acoustic-guitar"]),
        ("SCOPED", "landmark — Asia only", "a famous historic landmark", ["text", "image"], "World Landmarks & Cultures/Asia", ["taj-mahal", "great-wall"]),
        # E — disambiguation
        ("DISAMBIG", "rhythm & drums (music)", "keeping a steady beat and rhythm", ["text"], None, ["rhythm-tempo", "drum-kit", "timpani"]),
        ("DISAMBIG", "coral reef ecosystem", "a colourful underwater ecosystem built by tiny organisms", ["text", "image"], None, ["coral-reef"]),
    ]

    p1 = p3 = 0
    by_group: dict[str, list[int]] = {}
    print(f"{'GRP':9} {'TEST':36} {'TOP-1':24} HIT")
    print("-" * 86)
    for grp, desc, q, mods, scope, expected in CASES:
        did = dirs.get(scope) if scope else None
        hits = search(q, mods, cid, did)
        names = [h["file_name"].rsplit(".", 1)[0] for h in hits]
        top1 = names[0] if names else "—"
        in1 = bool(names) and any(top1 == e for e in expected)
        in3 = any(n in expected for n in names[:3])
        p1 += in1
        p3 += in3
        by_group.setdefault(grp, []).append(int(in3))
        mark = "✅" if in1 else ("🟡top3" if in3 else "❌")
        print(f"{grp:9} {desc[:36]:36} {top1[:24]:24} {mark}  {names}")

    n = len(CASES)
    print("-" * 86)
    print(f"TOP-1 exact: {p1}/{n} ({100*p1//n}%)   |   TOP-3: {p3}/{n} ({100*p3//n}%)")
    print("by group (top-3):", {g: f"{sum(v)}/{len(v)}" for g, v in by_group.items()})


if __name__ == "__main__":
    main()
