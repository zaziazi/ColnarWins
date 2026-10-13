#!/usr/bin/env python3
"""Place the AJPES hospitality businesses (whole of Slovenia) and merge them into the venue pool.

  python3 scripts/ajpes-nationwide.py hosp.json pool.json geocache.jsonl out.json

hosp.json   from `ajpes-import.py extract` (street + number only, no town!)
pool.json   every venue we have or are about to add (see itis-nationwide.py)
out.json    {"fills": [{"key", ajpes fields…}], "new": [venue rows], "skipped": [...]}

The register has no town, and street names repeat all over the country, so a
business is only placed when the evidence is clear:
  * its phone number is already on a pool venue            -> merged (certain)
  * a pool venue within 120 m of the geocoded street address has a similar name -> merged
  * the street address is unambiguous (all Nominatim candidates within 5 km)    -> added, 'ok'
  * ambiguous, but exactly one candidate fits the landline area code            -> added, 'unverified'
Everything else is skipped and listed, never guessed.
"""
import importlib.util, json, os, re, sys, time, urllib.parse, urllib.request

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ajpes_import", os.path.join(here, "ajpes-import.py"))
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)  # display_name, KIND_BY_SKD, km
spec2 = importlib.util.spec_from_file_location("itis_locate", os.path.join(here, "itis-locate.py"))
L = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(L)

UA = "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)"
_last = 0.0


def digits8(p):
    d = re.sub(r"\D", "", p or "")
    return d[-8:] if len(d) >= 8 else None


def area_of(lat, lng):
    """Rough landline area code (01/02/03/04/05/07) of a coordinate. Boundaries are approximate on purpose."""
    if lat < 46.0 and lng < 14.3 and lat > 45.4 and lng > 13.3 and (lng < 14.25 or lat < 45.75):
        return "05"
    if lat >= 46.2 and lng < 14.6 and not (lat < 46.3 and lng > 14.45):
        return "04"
    if lng >= 15.55 or (lat > 46.35 and lng > 15.2):
        return "02"
    if 14.9 < lng < 15.6 and 45.95 < lat < 46.45:
        return "03"
    if lat < 46.0 and lng >= 14.4:
        return "07"
    return "01"


def phone_area(tel):
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("386"):
        d = "0" + d[3:]
    return d[:2] if d.startswith(("01", "02", "03", "04", "05", "07")) else None


def geocode(q, cache, f):
    global _last
    if q in cache:
        return cache[q]
    wait = 1.1 - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        dict(q=q, format="jsonv2", limit=5, countrycodes="si", addressdetails=1))
    res = None
    for i in range(4):
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
            break
        except Exception:
            time.sleep(3 * (i + 1))
    _last = time.time()
    if res is not None:
        cache[q] = res
        f.write(json.dumps({"q": q, "hits": res}, ensure_ascii=False) + "\n")
        f.flush()
    return res or []


def main():
    items = json.load(open(sys.argv[1]))
    pool = json.load(open(sys.argv[2]))
    cache = {}
    if os.path.exists(sys.argv[3]):
        for line in open(sys.argv[3], encoding="utf-8"):
            d = json.loads(line)
            cache[d["q"]] = d["hits"]
    cf = open(sys.argv[3], "a", encoding="utf-8")

    have_ajpes = {v["ajpes_id"] for v in pool if v.get("ajpes_id")}
    by_phone = {}
    grid = {}
    for v in pool:
        k = digits8(v.get("phone"))
        if k:
            by_phone.setdefault(k, []).append(v)
        grid.setdefault((int(v["lat"] / 0.003), int(v["lng"] / 0.003)), []).append(v)

    fills, new, skipped, stats = {}, [], [], dict(have=0, phone=0, merged=0, added_ok=0, added_unverified=0, skipped=0)

    def ajpes_fields(it, tel):
        return dict(ajpes_id=it["maticna"], vat_id=it["vat"], legal_name=it["firma"], representative=it["zastopnik"],
                    revenue_eur=it["prihodki"], employees=int(it["zaposleni"]) if it["zaposleni"] is not None else None,
                    skd_code=str(it["skd"]), email=it["email"], phone=tel)

    for n, it in enumerate(items):
        if it["maticna"] in have_ajpes:
            stats["have"] += 1
            continue
        tel = (it.get("tel") or "").split(";")[0].strip() or None
        k = digits8(tel)
        hit = next(iter(by_phone.get(k, ())), None) if k else None
        if hit:
            fills[hit["key"]] = dict(key=hit["key"], **ajpes_fields(it, tel)); stats["phone"] += 1
            continue
        addr = it.get("naslov") or ""
        if not addr:
            skipped.append((it["firma"], "no address")); stats["skipped"] += 1
            continue
        hits = geocode(f"{addr}, Slovenija", cache, cf)
        if not hits:
            skipped.append((it["firma"], "no geocode")); stats["skipped"] += 1
            continue
        pts = [(float(h["lat"]), float(h["lon"]), h) for h in hits]
        unique = all(A.km((pts[0][0], pts[0][1]), (p[0], p[1])) < 5 for p in pts)
        status = "ok"
        chosen = pts[0]
        if not unique:
            area = phone_area(tel)
            fit = [p for p in pts if area and area_of(p[0], p[1]) == area]
            if len(fit) == 1:
                chosen, status = fit[0], "unverified"
            else:
                skipped.append((it["firma"], f"ambiguous street ({len(pts)} candidates)")); stats["skipped"] += 1
                continue
        lat, lng, h = chosen
        nm = A.display_name(it["firma"])
        t = L.toks(nm) | L.toks(it["firma"])
        gy, gx = int(lat / 0.003), int(lng / 0.003)
        dup = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for v in grid.get((gy + dy, gx + dx), ()):
                    d = L.dist(lat, lng, v["lat"], v["lng"])
                    if d <= 120 and (t & L.toks(v["name"])):
                        dup = v
        if dup:
            fills[dup["key"]] = dict(key=dup["key"], **ajpes_fields(it, tel)); stats["merged"] += 1
            continue
        a = h.get("address", {})
        road = a.get("road") or a.get("pedestrian") or ""
        street = " ".join(x for x in [road, a.get("house_number")] if x) or it.get("naslov")
        city = a.get("city") or a.get("town") or a.get("village") or a.get("municipality")
        new.append(dict(ajpes_fields(it, tel), name=nm,
                        kind=A.KIND_BY_SKD.get(round(it["skd"], 3), A.KIND_BY_SKD.get(round(it["skd"], 2), "restaurant")),
                        lat=lat, lng=lng, address=street, city=city, post_code=a.get("postcode"), location_status=status))
        stats["added_ok" if status == "ok" else "added_unverified"] += 1
        if (n + 1) % 50 == 0:
            print(n + 1, stats, flush=True)

    json.dump({"fills": list(fills.values()), "new": new, "skipped": skipped, "stats": stats},
              open(sys.argv[4], "w"), ensure_ascii=False)
    print("done", stats)


if __name__ == "__main__":
    main()
