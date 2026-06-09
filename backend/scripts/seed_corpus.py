"""Seed a multi-modal test corpus into BrainShare.

Text is written inline; image/audio/video are sourced from Wikimedia Commons
(CC / public domain) via its search API. Robust to missing media — logs what
lands. Run against a running backend:

    python scripts/seed_corpus.py <backend_url> <bearer_uuid>
"""

from __future__ import annotations

import sys
import time
import urllib.parse
import urllib.request

import httpx

UA = {"User-Agent": "BrainShare-research/0.1 (educational multimodal test corpus)"}
COMMONS = "https://commons.wikimedia.org/w/api.php"

BACKEND = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
UUID = sys.argv[2] if len(sys.argv) > 2 else ""
H = {"Authorization": f"Bearer {UUID}"}
client = httpx.Client(timeout=120, headers=H)


def commons_media(query: str, mimetype: str, max_bytes: int, width: int = 1280) -> bytes | None:
    """First Commons file matching mimetype under max_bytes (image → scaled thumb).

    Rate-limit-safe: throttles + retries the Commons API (anonymous bursts 429)."""
    import json

    params = {
        "action": "query", "generator": "search", "gsrsearch": query,
        "gsrnamespace": "6", "gsrlimit": "30", "prop": "imageinfo",
        "iiprop": "url|mime|size", "iiurlwidth": str(width), "format": "json",
    }
    data = None
    for attempt in range(4):
        time.sleep(1.3 + attempt * 1.5)  # throttle + backoff
        try:
            req = urllib.request.Request(COMMONS + "?" + urllib.parse.urlencode(params), headers=UA)
            data = json.load(urllib.request.urlopen(req, timeout=30))
            break
        except Exception:
            continue
    if data is None:
        return None
    pages = (data.get("query", {}).get("pages", {}) or {}).values()
    # sort by size asc for audio/video so we grab smaller files
    items = []
    for pg in pages:
        ii = (pg.get("imageinfo") or [{}])[0]
        mime = ii.get("mime", "")
        if not mime.startswith(mimetype):
            continue
        url = ii.get("thumburl") if mimetype == "image/" else ii.get("url")
        size = ii.get("size", 0)
        if url and "upload.wikimedia.org" in url:
            items.append((size, url, mime))
    if mimetype != "image/":
        items.sort(key=lambda x: x[0])
    for size, url, mime in items:
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read(max_bytes + 1)
            if 0 < len(data) <= max_bytes:
                return data
        except Exception:
            continue
    return None


def mkcollection(name: str) -> str:
    r = client.post(f"{BACKEND}/collections", json={"name": name})
    r.raise_for_status()
    return r.json()["id"]


def mkdir(cid: str, parent: str | None, name: str) -> str:
    r = client.post(f"{BACKEND}/directories", json={"collection_id": cid, "parent_id": parent, "name": name})
    r.raise_for_status()
    return r.json()["id"]


def upload(cid: str, did: str, name: str, data: bytes, mime: str) -> bool:
    try:
        r = client.post(
            f"{BACKEND}/files",
            data={"collection_id": cid, "directory_id": did},
            files={"file": (name, data, mime)},
        )
        return r.status_code == 201
    except Exception:
        return False


MIME = {"image": "image/jpeg", "audio": "audio/ogg", "video": "video/webm"}
EXT = {"image": ".jpg", "audio": ".ogg", "video": ".webm"}
LIMITS = {"image": 1_500_000, "audio": 12_000_000, "video": 45_000_000}


def add(cid: str, did: str, kind: str, name: str, payload: str) -> str:
    """kind: text → payload is content; else payload is a Commons query."""
    if kind == "text":
        ok = upload(cid, did, name + ".txt", payload.encode(), "text/plain")
        return "ok" if ok else "FAIL"
    data = commons_media(payload, kind + "/", LIMITS[kind])
    if not data:
        return "no-source"
    ok = upload(cid, did, name + EXT[kind], data, MIME[kind])
    return f"ok ({len(data)//1000}KB)" if ok else "FAIL"


# (folder, kind, filename, content-or-query)
MANIFEST: list[tuple[str, str, str, str, str]] = []


def item(theme, sub, kind, name, payload):
    MANIFEST.append((theme, sub, kind, name, payload))


# ───────────────────────────── Nature & Wildlife ─────────────────────────────
N = "Nature & Wildlife"
item(N, "Mammals", "text", "african-elephant", "The African bush elephant is the largest living land animal, with bulls reaching 6 tonnes. Its enormous ears radiate heat, its prehensile trunk has over 40,000 muscles, and matriarchal herds communicate across kilometres using low-frequency infrasound rumbles below human hearing.")
item(N, "Mammals", "text", "grey-wolf", "The grey wolf is the largest wild member of the dog family, a cooperative pack hunter of deer, elk and bison across the Northern Hemisphere. Packs are led by a breeding pair and coordinate hunts and territory through scent marking and the iconic group howl.")
item(N, "Mammals", "text", "red-fox", "The red fox is the most widespread wild carnivore on Earth, thriving from Arctic tundra to city centres. An opportunistic omnivore, it pounces on rodents located by sound, caches surplus food, and is recognised by its russet coat and white-tipped bushy tail.")
item(N, "Mammals", "image", "elephant", "African bush elephant savanna")
item(N, "Mammals", "image", "wolf", "grey wolf Canis lupus")
item(N, "Mammals", "image", "fox", "red fox Vulpes vulpes")
item(N, "Mammals", "audio", "wolf-howl", "wolf howl")
item(N, "Birds", "text", "bald-eagle", "The bald eagle, emblem of the United States, is a sea eagle with a 2-metre wingspan that snatches fish from the water surface with its talons. Adults show the unmistakable white head and tail; juveniles are mottled brown and take five years to mature.")
item(N, "Birds", "text", "common-blackbird", "The common blackbird is a thrush whose fluting, improvisational song is a hallmark of European dawns. Males are glossy black with a bright orange-yellow bill and eye-ring, while females are warm brown; the species adapts readily to gardens and parks.")
item(N, "Birds", "image", "eagle", "bald eagle Haliaeetus")
item(N, "Birds", "image", "blackbird", "common blackbird Turdus merula male")
item(N, "Birds", "audio", "blackbird-song", "blackbird song")
item(N, "Birds", "audio", "nightingale", "nightingale song")
item(N, "Ocean", "text", "humpback-whale", "Humpback whales are acrobatic baleen giants famed for breaching and for the long, structured songs sung by males on breeding grounds. They migrate thousands of kilometres and feed by bubble-net hunting, exhaling rings of bubbles to corral fish.")
item(N, "Ocean", "text", "coral-reef", "Coral reefs are built by colonies of tiny polyps that secrete calcium carbonate skeletons in symbiosis with photosynthetic algae. Though covering under 1% of the seafloor, they shelter roughly a quarter of all marine species and are acutely sensitive to warming and bleaching.")
item(N, "Ocean", "text", "great-white-shark", "The great white shark is the largest predatory fish, detecting prey with acute smell and electroreception before ambushing seals from below in a burst of speed. Despite its fearsome reputation, attacks on humans are rare and usually exploratory.")
item(N, "Ocean", "image", "coral-reef", "coral reef tropical fish")
item(N, "Ocean", "image", "whale", "humpback whale breaching")
item(N, "Ocean", "audio", "whale-song", "humpback whale song")

# ───────────────────────────── Space & Astronomy ─────────────────────────────
S = "Space & Astronomy"
item(S, "Galaxies & Nebulae", "text", "pillars-of-creation", "The Pillars of Creation are towering columns of cold gas and dust in the Eagle Nebula, about 6,500 light-years away, where new stars are being born. Imaged famously by Hubble and later in crisp infrared by the James Webb Space Telescope, the pillars are slowly eroding under stellar radiation.")
item(S, "Galaxies & Nebulae", "text", "andromeda-galaxy", "The Andromeda Galaxy is the nearest large spiral to the Milky Way, some 2.5 million light-years away and home to a trillion stars. It is approaching us and will merge with our galaxy in roughly four billion years to form a single elliptical system.")
item(S, "Galaxies & Nebulae", "text", "black-hole", "A black hole is a region where gravity is so strong that nothing, not even light, can escape past its event horizon. The first image of one, the supermassive black hole in galaxy M87, revealed a glowing ring of superheated matter around a central shadow.")
item(S, "Galaxies & Nebulae", "image", "nebula", "Pillars of Creation Eagle Nebula")
item(S, "Galaxies & Nebulae", "image", "andromeda", "Andromeda Galaxy M31")
item(S, "Galaxies & Nebulae", "image", "spiral-galaxy", "spiral galaxy Hubble")
item(S, "Galaxies & Nebulae", "image", "saturn", "planet Saturn rings Cassini")
item(S, "Missions", "text", "apollo-11", "Apollo 11 carried the first humans to the Moon in July 1969. Neil Armstrong and Buzz Aldrin spent about two hours walking the Sea of Tranquillity while Michael Collins orbited above, returning 21.5 kg of lunar samples and Armstrong's words about a giant leap for mankind.")
item(S, "Missions", "text", "voyager", "The twin Voyager probes, launched in 1977, toured the outer planets and became the first human-made objects to enter interstellar space. Each carries a Golden Record of sounds and images of Earth, a message in a bottle cast into the galaxy.")
item(S, "Missions", "image", "rocket-launch", "Saturn V rocket launch Apollo")
item(S, "Missions", "video", "launch", "rocket launch")
item(S, "Phenomena", "text", "pulsar", "A pulsar is a rapidly spinning neutron star that sweeps beams of radio waves across space like a lighthouse, ticking with extraordinary regularity. Converted to sound, these pulses produce the steady rhythmic beats that gave the first-discovered pulsar the nickname LGM-1.")
item(S, "Phenomena", "text", "aurora", "Auroras are curtains of green and crimson light produced when charged particles from the Sun funnel along Earth's magnetic field and excite atoms in the upper atmosphere. They ring the magnetic poles as the aurora borealis in the north and australis in the south.")
item(S, "Phenomena", "image", "aurora", "aurora borealis northern lights")

# ───────────────────────────── Music & Instruments ───────────────────────────
M = "Music & Instruments"
item(M, "Strings", "text", "violin", "The violin is the smallest and highest-pitched member of the bowed string family, with four strings tuned in fifths. Its expressive, vocal tone makes it the leading voice of the orchestra; the finest examples by Stradivari remain unmatched benchmarks of craft.")
item(M, "Strings", "text", "acoustic-guitar", "The acoustic guitar produces sound from six strings vibrating over a hollow wooden body that amplifies them. Versatile across classical, folk, blues and rock, it is played by strumming chords or picking individual notes, and is among the world's most popular instruments.")
item(M, "Strings", "image", "violin", "violin instrument")
item(M, "Strings", "image", "guitar", "acoustic guitar")
item(M, "Strings", "audio", "violin", "violin solo")
item(M, "Strings", "audio", "guitar", "classical guitar")
item(M, "Percussion", "text", "drum-kit", "A drum kit gathers drums and cymbals into one setup played by a single drummer using sticks and foot pedals. The bass drum and snare lay down the backbeat while hi-hats and ride cymbals keep time, anchoring the rhythm of nearly all popular music.")
item(M, "Percussion", "text", "timpani", "Timpani, or kettledrums, are large tuned drums with a pedal that changes the tension of the head to alter pitch. They provide the thunder and tonal foundation of the orchestral percussion section, capable of both delicate rolls and dramatic punctuation.")
item(M, "Percussion", "image", "drums", "drum kit")
item(M, "Percussion", "audio", "drums", "drum beat")
item(M, "Theory", "text", "major-scale", "A major scale is a sequence of seven notes following the interval pattern whole-whole-half-whole-whole-whole-half, producing the bright, resolved sound at the heart of Western tonality. Each major key is built from this pattern starting on a different note.")
item(M, "Theory", "text", "chord-harmony", "Harmony is the simultaneous sounding of notes to form chords and their progressions. Triads stack thirds into major and minor chords, and tension-and-release between chords such as the dominant resolving to the tonic gives Western music its sense of motion and arrival.")
item(M, "Theory", "text", "rhythm-tempo", "Rhythm organises music in time through patterns of stressed and unstressed beats grouped into measures, while tempo sets their speed in beats per minute. Together they define a piece's feel, from a slow, solemn adagio to a driving, energetic allegro.")

# ───────────────────────── World Landmarks & Cultures ────────────────────────
W = "World Landmarks & Cultures"
item(W, "Europe", "text", "eiffel-tower", "The Eiffel Tower is a 330-metre wrought-iron lattice tower built for the 1889 World's Fair in Paris and once the tallest structure on Earth. Initially criticised by artists, it became the enduring symbol of France and the most-visited paid monument in the world.")
item(W, "Europe", "text", "colosseum", "The Colosseum is a vast Roman amphitheatre completed around AD 80 that held tens of thousands of spectators for gladiatorial contests and public spectacles. Its arches and vaults pioneered crowd engineering still echoed in modern stadiums.")
item(W, "Europe", "text", "sagrada-familia", "The Sagrada Família is Antoni Gaudí's unfinished basilica in Barcelona, begun in 1882 and still under construction. Its organic, tree-like columns and kaleidoscopic stained glass fuse Gothic tradition with nature-inspired forms unlike any other church.")
item(W, "Europe", "image", "eiffel", "Eiffel Tower Paris")
item(W, "Europe", "image", "colosseum", "Colosseum Rome")
item(W, "Europe", "image", "sagrada", "Sagrada Familia Barcelona")
item(W, "Asia", "text", "taj-mahal", "The Taj Mahal is a white marble mausoleum in Agra, India, built by the Mughal emperor Shah Jahan for his wife Mumtaz Mahal in the 17th century. Perfectly symmetrical and inlaid with semi-precious stones, it is regarded as the jewel of Indo-Islamic architecture.")
item(W, "Asia", "text", "great-wall", "The Great Wall of China is a network of fortifications stretching thousands of kilometres, built and rebuilt over centuries to guard the empire's northern frontier. Following ridgelines across mountains and desert, it is among the largest construction projects ever undertaken.")
item(W, "Asia", "image", "taj-mahal", "Taj Mahal Agra")
item(W, "Asia", "image", "great-wall", "Great Wall of China")
item(W, "Americas", "text", "grand-canyon", "The Grand Canyon is a mile-deep gorge carved by the Colorado River over millions of years, exposing nearly two billion years of rock layers in bands of red and ochre. Its immense scale and shifting light make it one of Earth's most striking natural wonders.")
item(W, "Americas", "text", "machu-picchu", "Machu Picchu is a 15th-century Inca citadel set on a ridge high in the Peruvian Andes, abandoned and largely forgotten until 1911. Its dry-stone terraces and temples, built without mortar, demonstrate masterful engineering in a spectacular cloud-forest setting.")
item(W, "Americas", "image", "grand-canyon", "Grand Canyon Colorado River")
item(W, "Americas", "image", "machu-picchu", "Machu Picchu Peru")


def main() -> None:
    print(f"seeding → {BACKEND}")
    cid = mkcollection("Knowledge Base")
    print("collection", cid)
    # build folder tree, caching ids
    dirs: dict[tuple[str, str | None], str] = {}
    themes = dict.fromkeys(t for t, *_ in MANIFEST)
    for theme in themes:
        tid = mkdir(cid, None, theme)
        dirs[(theme, None)] = tid
        subs = dict.fromkeys(s for t, s, *_ in MANIFEST if t == theme)
        for sub in subs:
            dirs[(theme, sub)] = mkdir(cid, tid, sub)
    print(f"created {len(dirs)} folders")

    counts: dict[str, int] = {}
    for theme, sub, kind, name, payload in MANIFEST:
        did = dirs[(theme, sub)]
        status = add(cid, did, kind, name, payload)
        ok = status.startswith("ok")
        counts[kind] = counts.get(kind, 0) + (1 if ok else 0)
        print(f"  [{kind:5}] {theme}/{sub}/{name}: {status}")
    print("\nUPLOADED:", counts, "of", {
        k: sum(1 for *_, kk, _, _ in MANIFEST if kk == k) for k in MIME | {"text": ""}
    })
    print("COLLECTION_ID", cid)


if __name__ == "__main__":
    main()
