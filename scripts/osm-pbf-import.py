#!/usr/bin/env python3
"""Hospitality venues for a whole country from a Geofabrik OSM extract (no Overpass needed).

  curl -L -o slovenia.osm.pbf https://download.geofabrik.de/europe/slovenia-latest.osm.pbf
  python3 scripts/osm-pbf-import.py slovenia.osm.pbf osm_all.json [country.geojson]

Same selection and field mapping as osm-import.mjs (restaurants, bars, pubs, cafés, fast food, hotels,
guest houses, wine shops; named only), so rows are interchangeable and keyed by (osm_type, osm_id).
Overpass struggles with country-sized queries; the extract is the reliable route.
Needs: pip install osmium.   Data © OpenStreetMap contributors (ODbL).
"""
import json, sys

import osmium

KEEP_TAGS = ["cuisine", "stars", "outdoor_seating", "operator"]


def kind_of(t):
    if t.get("amenity") in ("restaurant", "bar", "pub", "cafe", "fast_food"):
        return t["amenity"]
    if t.get("tourism") == "hotel":
        return "hotel"
    if t.get("tourism") == "guest_house":
        return "guest_house"
    if t.get("shop") == "wine":
        return "wine_shop"
    return None


def first(v):
    return str(v).split(";")[0].strip() if v else None


def row(osm_type, osm_id, t, lat, lng):
    name = (t.get("name") or "").strip()
    kind = kind_of(t)
    if not name or not kind:
        return None
    street = t.get("addr:street") or t.get("addr:place")
    return dict(
        osm_type=osm_type, osm_id=osm_id, name=name, kind=kind, lat=lat, lng=lng,
        address=" ".join(x for x in [street, t.get("addr:housenumber")] if x) or None,
        city=t.get("addr:city"), post_code=t.get("addr:postcode"),
        website=first(t.get("website") or t.get("contact:website") or t.get("url")),
        opening_hours=t.get("opening_hours"),
        phone=first(t.get("phone") or t.get("contact:phone") or t.get("contact:mobile")),
        email=first(t.get("email") or t.get("contact:email")),
        osm_tags={k: t[k] for k in KEEP_TAGS if t.get(k)},
    )


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def node(self, n):
        t = {tag.k: tag.v for tag in n.tags}
        if t.get("name") and kind_of(t):
            r = row("node", n.id, t, n.location.lat, n.location.lon)
            if r:
                self.rows.append(r)

    def area(self, a):
        t = {tag.k: tag.v for tag in a.tags}
        if not (t.get("name") and kind_of(t)):
            return
        lats, lngs = [], []
        for ring in a.outer_rings():
            for nd in ring:
                lats.append(nd.lat)
                lngs.append(nd.lon)
        if not lats:
            return
        # Overpass `out center` uses the middle of the bounding box; do the same so ids and positions agree.
        r = row("way" if a.from_way() else "relation", a.orig_id(), t, (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2)
        if r:
            self.rows.append(r)


def inside(ring, lat, lng):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def main():
    h = Handler()
    h.apply_file(sys.argv[1], locations=True)
    rows = h.rows
    if len(sys.argv) > 3:
        g = json.load(open(sys.argv[3]))["features"][0]["geometry"]
        ring = (g["coordinates"][0] if g["type"] == "MultiPolygon" else g["coordinates"])[0]
        before = len(rows)
        rows = [r for r in rows if inside(ring, r["lat"], r["lng"])]
        print(f"polygon filter: {before} -> {len(rows)}")
    json.dump(rows, open(sys.argv[2], "w"), ensure_ascii=False)
    by = {}
    for r in rows:
        by[r["kind"]] = by.get(r["kind"], 0) + 1
    print(len(rows), by)
    print("with phone", sum(1 for r in rows if r["phone"]), "email", sum(1 for r in rows if r["email"]), "address", sum(1 for r in rows if r["address"]))


if __name__ == "__main__":
    main()
