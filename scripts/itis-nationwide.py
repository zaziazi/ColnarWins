#!/usr/bin/env python3
"""Merge the scraped iTIS listing (all of Slovenia) into the venue pool.

  python3 scripts/itis-nationwide.py itis.json pool.json geocache.jsonl out.json

itis.json     rows from itis-scrape.py (itis_id, name, phones[], address, place "1351 Town")
pool.json     every venue we already have or are about to add:
              [{"key", "name", "lat", "lng", "phone", "city", "post_code", "db_id"|null, "itis_id"}]
geocache      JSON lines, one per geocoded query — makes the (1 request/s) run resumable
out.json      {"fills": [{"key", "itis_id", "phone"}], "new": [venue rows]}

1. A listing whose phone number is already on a pool venue is merged into it (itis_id + phone).
2. Otherwise it is geocoded (Nominatim, 1 req/s). A result within 150 m of a pool venue
   with a similar name (or within 25 m) is merged; anything else becomes a new 'itis' venue.
   Only a town-level geocode is marked location_status 'unverified'.
Used with TSmedia's permission for the listing pages only (see itis-scrape.py).
"""
import importlib.util, json, os, re, sys, time, urllib.parse, urllib.request

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("itis_locate", os.path.join(here, "itis-locate.py"))
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)  # display_name, kind_of, toks, dist, fold

UA = "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)"
BOX = (45.40, 13.35, 46.90, 16.62)  # Slovenia sanity box
_last = 0.0


def digits8(p):
    d = re.sub(r"\D", "", p or "")
    return d[-8:] if len(d) >= 8 else None


def nominatim(q, cache, cache_f):
    global _last
    if q in cache:
        return cache[q]
    wait = 1.1 - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        dict(q=q, format="jsonv2", limit=1, countrycodes="si", addressdetails=1))
    res = None
    for i in range(4):
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
            break
        except Exception:
            time.sleep(3 * (i + 1))
    _last = time.time()
    hit = res[0] if res else None
    if res is not None:  # a failed request (None) is not cached, an empty answer is
        cache[q] = hit
        cache_f.write(json.dumps({"q": q, "hit": hit}, ensure_ascii=False) + "\n")
        cache_f.flush()
    return hit


def main():
    itis = json.load(open(sys.argv[1]))
    pool = json.load(open(sys.argv[2]))
    cache = {}
    if os.path.exists(sys.argv[3]):
        for line in open(sys.argv[3], encoding="utf-8"):
            d = json.loads(line)
            cache[d["q"]] = d["hit"]
    cache_f = open(sys.argv[3], "a", encoding="utf-8")

    by_phone = {}
    for v in pool:
        k = digits8(v.get("phone"))
        if k:
            by_phone.setdefault(k, []).append(v)
    grid = {}
    for v in pool:
        grid.setdefault((int(v["lat"] / 0.003), int(v["lng"] / 0.003)), []).append(v)
    have_itis = {v["itis_id"] for v in pool if v.get("itis_id")}
    by_town = {}
    for v in pool:
        for k in {L.fold(v.get("city") or ""), v.get("post_code") or ""}:
            if k:
                by_town.setdefault(k, []).append(v)

    fills, new, seen, stats = {}, [], set(), dict(phone=0, merged=0, new_house=0, new_town=0, skipped=0, nogeo=0, tagged=0)

    def fill(v, row):
        f = fills.setdefault(v["key"], {"key": v["key"], "itis_id": row["itis_id"], "phone": None})
        if not v.get("phone") and row["phones"]:
            f["phone"] = "+386 " + re.sub(r"^0", "", row["phones"][0])

    for n, row in enumerate(itis):
        if row["itis_id"] in have_itis:
            stats["tagged"] += 1
            continue
        phones = [digits8(p) for p in row["phones"]]
        hit = next((v for p in phones if p for v in by_phone.get(p, ())), None)
        if hit:
            fill(hit, row); stats["phone"] += 1
            continue

        m = re.match(r"(\d{4})\s+(.*)", row.get("place") or "")
        pc, town = (m.group(1), m.group(2)) if m else (None, None)
        addr = re.sub(r"\s+,", ",", re.sub(r"\s+", " ", row["address"] or "")).strip(" ,")
        key = (L.fold(addr), L.fold(row["phones"][0] if row["phones"] else ""))
        if key in seen:
            stats["skipped"] += 1
            continue
        seen.add(key)

        g = nominatim(f"{addr}, {pc} {town}", cache, cache_f) if addr and pc else None
        q = "house"
        if g and g.get("address", {}).get("postcode") and pc and g["address"]["postcode"] != pc:
            g = None
        if not g or not (BOX[0] < float(g["lat"]) < BOX[2] and BOX[1] < float(g["lon"]) < BOX[3]):
            g = nominatim(f"{pc} {town}", cache, cache_f) if pc else None
            q = "town"
        if not g:
            stats["nogeo"] += 1
            continue
        lat, lng = float(g["lat"]), float(g["lon"])
        if not (BOX[0] < lat < BOX[2] and BOX[1] < lng < BOX[3]):
            stats["nogeo"] += 1
            continue

        nm = L.display_name(row["name"])
        t = L.toks(nm)
        gy, gx = int(lat / 0.003), int(lng / 0.003)
        dup = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for v in grid.get((gy + dy, gx + dx), ()):
                    d = L.dist(lat, lng, v["lat"], v["lng"])
                    if d <= 150 and ((t & L.toks(v["name"])) or d <= 25):
                        dup = v
        if not dup and q == "town":
            # No usable coordinates: merge into a venue in the same town with a clearly similar name.
            for v in by_town.get(pc, []) + by_town.get(L.fold(town or ""), []):
                if t and len(t & L.toks(v["name"])) >= max(1, min(len(t), len(L.toks(v["name"]))) // 2 + (1 if min(len(t), len(L.toks(v["name"]))) > 2 else 0)):
                    dup = v
                    break
        if dup:
            fill(dup, row); stats["merged"] += 1
            continue
        phone1 = ("+386 " + re.sub(r"^0", "", row["phones"][0])) if row["phones"] else None
        r = dict(itis_id=row["itis_id"], name=nm, kind=L.kind_of(row["name"]), lat=round(lat, 6), lng=round(lng, 6),
                 address=addr.split(",")[0] if q == "house" else None, city=town, post_code=pc, phone=phone1,
                 quality=q, rn=row.get("rn") or None)
        new.append(r)
        stats["new_house" if q == "house" else "new_town"] += 1
        if (n + 1) % 100 == 0:
            print(n + 1, stats, flush=True)

    json.dump({"fills": list(fills.values()), "new": new, "stats": stats}, open(sys.argv[4], "w"), ensure_ascii=False)
    print("done", stats)


if __name__ == "__main__":
    main()
