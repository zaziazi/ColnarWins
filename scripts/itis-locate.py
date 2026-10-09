#!/usr/bin/env python3
"""Geocode scraped iTIS rows, drop ones already on the map, emit a venue import payload.

  python3 scripts/itis-locate.py cand.json venues_now.json out.json

cand.json   rows [itis_id, rn, name, phone, address, pc, town] to consider
venues_now  current venues [{id,name,lat,lng,...}] to dedupe against
Nominatim: 1 request/s, identifying User-Agent.
"""
import json, re, sys, time, urllib.parse, urllib.request, math, unicodedata

UA = "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)"
BOX = (45.4, 14.5, 46.2, 15.8)  # s w n e sanity box


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        dict(q=q, format="jsonv2", limit=1, countrycodes="si", addressdetails=1))
    for i in range(3):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
            time.sleep(1.1)
            return r[0] if r else None
        except Exception as e:
            time.sleep(3)
    return None


def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in s if unicodedata.category(c) != "Mn"))


STOP = set("d o s p gostilna gostilnica gostisce restavracija pizzerija pizzeria picerija bar kavarna okrepcevalnica gostinstvo gostinske storitve in pri d o o s p turizem".split())


def toks(n):
    return {t for t in fold(n).split() if t not in STOP and len(t) > 2}


def dist(a, b, c, d):
    p = math.pi / 180
    x = (c - a) * p
    y = (d - b) * p * math.cos((a + c) / 2 * p)
    return 6371000 * math.hypot(x, y)


SMALL = {"in", "pri", "na", "ob", "za", "pod", "z", "s", "v"}


def display_name(raw):
    n = re.sub(r"\s+", " ", raw.replace("''", "'").replace("´", "'")).strip(" ,")
    n = n.replace('"', "")
    # "FIRMA D.O.O. GOSTILNA X" -> "GOSTILNA X" (the establishment's own name)
    m = re.search(r"d\.?\s?o\.?\s?o\.?,?\s+((?:gostiln|gostišč|restavrac|marché|kralj|hotel|dvorec|pizz|bar\b).*)$", n, flags=re.I)
    if m:
        n = m.group(1)
    n = re.sub(r",?\s*(d\.?\s?o\.?\s?o\.?|s\.\s?p\.?|d\.d\.)\s*,?$", "", n, flags=re.I).strip(" ,-")
    if n.isupper():
        w = [x.capitalize() if x.lower() not in SMALL or i == 0 else x.lower() for i, x in enumerate(n.split(" "))]
        n = " ".join(w)
    return n


def kind_of(n):
    n = n.lower()
    if re.search(r"hotel|penzion|apartma|nocisc|prenočišč", n): return "hotel" if "hotel" in n else "guest_house"
    if re.search(r"pivnic|\bbar\b|kavarn|slaščičar|sladoled", n): return "cafe" if re.search(r"kavarn|slaščičar|sladoled", n) else "bar"
    if re.search(r"catering|priprava", n): return "catering"
    if re.search(r"okrepčeval", n): return "fast_food"
    return "restaurant"


if __name__ == "__main__":
    cand = json.load(open(sys.argv[1]))
    now = json.load(open(sys.argv[2]))
    out, dropped, seen = [], [], set()
    for itis_id, rn, name, phone, addr, pc, town in cand:
        a = re.sub(r"\s+,", ",", re.sub(r"\s+", " ", addr or "")).strip(" ,")
        key = (fold(a), fold(phone or ""))
        if key in seen:
            dropped.append((name, "dup-in-itis")); continue
        seen.add(key)
        hit = nominatim(f"{a}, {pc} {town}") if a else None
        q = "house"
        if hit and hit.get("address", {}).get("postcode") and hit["address"]["postcode"] != pc:
            hit = None
        if not hit or not (BOX[0] < float(hit["lat"]) < BOX[2] and BOX[1] < float(hit["lon"]) < BOX[3]):
            hit = nominatim(f"{pc} {town}")
            q = "town"
        if not hit:
            dropped.append((name, "no-geocode")); continue
        lat, lng = float(hit["lat"]), float(hit["lon"])
        if not (BOX[0] < lat < BOX[2] and BOX[1] < lng < BOX[3]):
            dropped.append((name, "outside")); continue
        nm = display_name(name)
        t = toks(nm)
        dup = None
        for v in now:
            d = dist(lat, lng, v["lat"], v["lng"])
            if d <= 150 and (t & toks(v["name"]) or d <= 25):
                dup = (v["name"], int(d), v["id"]); break
        if dup:
            dropped.append((name, f"on-map: {dup[0]} {dup[1]}m", dup[2], (phone or "").split(" / ")[0])); continue
        phone1 = (phone or "").split(" / ")[0]
        phone1 = "+386 " + re.sub(r"^0", "", phone1) if phone1 else None
        out.append(dict(itis_id=itis_id, name=nm, kind=kind_of(name), lat=round(lat, 6), lng=round(lng, 6),
                        address=a.split(",")[0] if q == "house" else None, city=town, post_code=pc, phone=phone1,
                        quality=q, rn=rn or None))
        print(len(out), nm, q, flush=True)
    json.dump(dict(rows=out, dropped=dropped), open(sys.argv[3], "w"), ensure_ascii=False, indent=0)
    print("kept", len(out), "dropped", len(dropped))
