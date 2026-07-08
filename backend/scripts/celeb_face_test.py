"""E2E face test with PUBLIC figures' freely-licensed photos (Wikimedia Commons).

Purpose: verify the consented face-grouping feature end to end — detect distinct
faces, cluster same-person photos, name a person once and have their OTHER photos
attach automatically (no per-photo reclassifying). Uses well-known public figures
as a standard QA test set; no stranger identification, no external data lookup.

    python scripts/celeb_face_test.py         # download + upload + report

Run against the LOCAL backend (127.0.0.1:8000) with env loaded.
"""

import io
import sys
import time
import urllib.parse
import urllib.request

import httpx

BACKEND = "http://127.0.0.1:8000"
UUID = "e2c578bf-1061-4488-9879-ca1b76b0b796"  # the seeded relik account
H = {"Authorization": f"Bearer {UUID}"}
UA = {"User-Agent": "BrainShare-facetest/0.1 (QA; multimodal face-grouping test)"}
COMMONS = "https://commons.wikimedia.org/w/api.php"

# Mix of men and women, all major public figures with rich Commons categories.
PEOPLE = {
    "Nicolas Cage": 8,
    "Tom Hanks": 8,
    "Barack Obama": 8,
    "Scarlett Johansson": 8,
    "Angela Merkel": 8,
    "Emma Watson": 8,
}


def _api(params: dict, tries: int = 5) -> dict:
    import json

    url = COMMONS + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 5})
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code == 503:
                time.sleep(3 * (i + 1))
                continue
            raise
    return {}


def search_portrait_urls(person: str, width: int = 900) -> list[str]:
    """Search the File namespace for the person (one batched call) → thumbnail URLs.
    Search returns relevant press/portrait photos more reliably than category walks."""
    data = _api(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": f'intitle:"{person}"',
            "gsrnamespace": 6,  # File:
            "gsrlimit": 40,
            "prop": "imageinfo",
            "iiprop": "url|mime",
            "iiurlwidth": width,
        }
    )
    pages = data.get("query", {}).get("pages", {})
    urls = []
    for _, p in sorted(pages.items(), key=lambda kv: kv[1].get("index", 999)):
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        src = info.get("thumburl") or info.get("url")
        if src:
            urls.append(src)
    time.sleep(1)
    return urls


def download(src: str) -> bytes | None:
    try:
        req = urllib.request.Request(src, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read()
        if 5_000 < len(b) < 8_000_000:
            return b
    except Exception:
        return None
    return None


def main() -> None:
    c = httpx.Client(timeout=120, headers=H)
    coll = c.post(f"{BACKEND}/collections", json={"name": "Face test — public figures"}).json()
    cid = coll["id"]
    print(f"collection: {cid}")

    def pending_count() -> int:
        fs = c.get(f"{BACKEND}/files", params={"collection_id": cid}).json()
        return sum(1 for f in fs if f["status"] == "pending")

    uploaded = 0
    for person, want in PEOPLE.items():
        got = 0
        urls = search_portrait_urls(person)
        for src in urls:
            if got >= want:
                break
            b = download(src)
            if not b:
                continue
            # Throttle so the ingest queue (each task holds a DB session) doesn't pile up.
            while pending_count() >= 6:
                time.sleep(3)
            fname = f"{person.replace(' ', '_').lower()}_{got}.jpg"
            files = {"file": (fname, io.BytesIO(b), "image/jpeg")}
            r = c.post(f"{BACKEND}/files", data={"collection_id": cid}, files=files)
            if r.status_code == 201:
                got += 1
                uploaded += 1
            time.sleep(0.4)
        print(f"  {person}: uploaded {got}")
    print(f"total uploaded: {uploaded}")
    print("waiting for face ingest…")
    # Poll until the collection's files are all out of 'pending'.
    for _ in range(120):
        files = c.get(f"{BACKEND}/files", params={"collection_id": cid}).json()
        pending = [f for f in files if f["status"] == "pending"]
        if not pending:
            break
        time.sleep(5)
    faces_total = sum(f.get("meta", {}).get("face_count", 0) for f in files)
    print(f"files: {len(files)}, faces detected: {faces_total}")

    name_of = {f["id"]: f["name"] for f in files}
    print("\n== INBOX CLUSTERS (same-person grouping; ≥2 faces shown) ==")
    clusters = c.get(f"{BACKEND}/collections/{cid}/faces/inbox").json()
    multi = [cl for cl in clusters if cl["count"] >= 2]
    singles = len(clusters) - len(multi)
    for cl in multi:
        names = [name_of.get(f["file_id"], "?").replace(".jpg", "") for f in cl["faces"]]
        print(f"  [{cl['count']}] {names}")
    print(f"… + {singles} single-face clusters")
    print(f"total: {len(clusters)} clusters from {faces_total} faces")
    print(f"COLLECTION_ID={cid}")


if __name__ == "__main__":
    main()
