#!/usr/bin/env python3
"""Give venues without a town the name of the nearest settlement (from the same OSM extract).

  python3 scripts/fill-city.py slovenia.osm.pbf places.json            # 1) extract settlements
  IMPORT_EMAIL=… IMPORT_PASSWORD=… python3 scripts/fill-city.py --apply places.json [--dry]

Half of the OSM venues carry no addr:city, and the sales planner groups venues by town, so
those would never show up there. A venue within 3 km of a city/town/village (nearest wins;
hamlets only as a fallback) gets that name as `city`. Existing cities are never changed.
"""
import json, math, sys
from concurrent.futures import ThreadPoolExecutor

RANK = {"city": 0, "town": 0, "village": 0, "hamlet": 1, "suburb": 1, "locality": 2}


def extract(pbf, out):
    import osmium

    class H(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.places = []

        def node(self, n):
            p = n.tags.get("place")
            name = n.tags.get("name")
            if p in RANK and name:
                self.places.append(dict(name=name, kind=p, lat=n.location.lat, lng=n.location.lon))

    h = H()
    h.apply_file(pbf)
    json.dump(h.places, open(out, "w"), ensure_ascii=False)
    print(len(h.places), "places")


def metres(a, b, c, d):
    p = math.pi / 180
    return 6371000 * math.hypot((c - a) * p, (d - b) * p * math.cos((a + c) / 2 * p))


def apply(places_path, dry):
    sys.path.insert(0, __import__("os").path.dirname(__file__))
    from pg import PG

    places = json.load(open(places_path))
    grid = {}
    for p in places:
        grid.setdefault((int(p["lat"] / 0.03), int(p["lng"] / 0.03)), []).append(p)

    pg = PG()
    venues = pg.select_all("venue", "id,lat,lng,city", "&or=(city.is.null,city.eq.)")
    todo = []
    for v in venues:
        gy, gx = int(v["lat"] / 0.03), int(v["lng"] / 0.03)
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for p in grid.get((gy + dy, gx + dx), ()):
                    d = metres(v["lat"], v["lng"], p["lat"], p["lng"])
                    if d > 3000:
                        continue
                    key = (RANK[p["kind"]], d)
                    if best is None or key < best[0]:
                        best = (key, p)
        if best:
            todo.append((v["id"], best[1]["name"]))
    print(f"{len(venues)} venues without a town, {len(todo)} get one")
    if dry:
        return
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda t: pg.patch("venue", {"id": t[0]}, {"city": t[1]}), todo))
    print("patched", len(todo))


if __name__ == "__main__":
    if sys.argv[1] == "--apply":
        apply(sys.argv[2], "--dry" in sys.argv)
    else:
        extract(sys.argv[1], sys.argv[2])
