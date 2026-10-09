#!/usr/bin/env python3
"""
Finds hospitality places in Overture Maps (places theme; Meta, Foursquare, … —
license CDLA-Permissive-2.0, attribution required) that are NOT yet on our
map, and writes SQL that adds them as venues with source 'overture'.

  python3 scripts/overture-import.py venues-we-have.csv ./overture-sql \
          --bbox 45.55,14.7,46.15,15.55 --release 2026-09-23.1

`venues-we-have.csv` is "lat,lng,name" per line (export from the venue table).
A place counts as already known when one of our venues is within 40 m, or
within 300 m with a similar name.

Requires: pip install duckdb
"""
import json, math, os, re, sys, unicodedata

import duckdb

EXCLUDED_TAXONOMY = {
    "winery", "vineyard", "bakery", "ski_resort", "holiday_rental_home", "cottage", "cabin",
    "service_apartment", "ice_cream_shop", "dessert_shop", "chocolatier", "smoothie_juice_bar",
}
BAD_NAME = re.compile(
    r"\b(spar|mercator|hofer|lidl|tuš|eurospin|trgovina|market|pekarna|pekarija|vinska klet|colnar|"
    r"apartma|apartment|kozmet|salon|čebelar|cerastyle|dijaški|študentski|mobile house|smučišče)\b",
    re.I,
)
STOP = {"d", "o", "s", "p", "doo", "gostilna", "gostisce", "restavracija", "pizzerija", "picerija", "bar",
        "kavarna", "cafe", "caffe", "pub", "hotel", "in", "pri", "the", "restaurant", "gostilnica",
        "okrepcevalnica", "bistro"}


def fold(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def tokens(s):
    return {t for t in re.sub(r"[^a-z0-9 ]", " ", fold(s)).split() if len(t) > 1 and t not in STOP}


def metres(a, b, c, d):
    dl, dg = math.radians(c - a), math.radians(d - b)
    h = math.sin(dl / 2) ** 2 + math.cos(math.radians(a)) * math.cos(math.radians(c)) * math.sin(dg / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def kind_of(t):
    t = t or ""
    if t == "campground": return "camping"
    if t in ("hotel", "resort", "motel", "inn", "lodge"): return "hotel"
    if t in ("lodging", "bed_and_breakfast", "hostel", "private_lodging", "guest_house", "farm_stay"): return "guest_house"
    if t in ("pub", "gastropub"): return "pub"
    if t in ("bar", "lounge", "beer_garden", "beer_bar", "wine_bar", "cocktail_bar", "brewery", "sports_bar",
             "night_club", "bar_and_grill_restaurant"): return "bar"
    if t in ("cafe", "coffee_shop", "tea_room", "cafeteria"): return "cafe"
    if "fast_food" in t or "burger" in t or "kebab" in t or t in ("food_truck_stand", "pizza_takeout"): return "fast_food"
    if "catering" in t: return "catering"
    if "restaurant" in t or t in ("diner", "bistro", "food_and_drink", "eatery", "casual_eatery"): return "restaurant"
    return None


def main():
    have_csv, outdir = sys.argv[1], sys.argv[2]
    opt = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d  # noqa: E731
    s, w, n, e = [float(x) for x in opt("--bbox", "45.55,14.7,46.15,15.55").split(",")]
    release = opt("--release", "2026-09-23.1")
    region = opt("--region", "dolenjska")

    ours = []
    for line in open(have_csv, encoding="utf-8"):
        lat, lng, name = line.rstrip("\n").split(",", 2)
        ours.append((float(lat), float(lng), name, tokens(name), fold(name)))

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    rows = con.execute(
        f"""select id, names."primary" as name, taxonomy."primary" as tax, taxonomy.hierarchy as hier,
                   confidence, operating_status as status, phones, emails, websites, addresses,
                   bbox.xmin as lng, bbox.ymin as lat
            from read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning=1)
            where bbox.xmin between {w} and {e} and bbox.ymin between {s} and {n}"""
    ).fetchall()
    cols = ["id", "name", "tax", "hier", "confidence", "status", "phones", "emails", "websites", "addresses", "lng", "lat"]
    places = [dict(zip(cols, r)) for r in rows]

    def known(p):
        t, f = tokens(p["name"]), fold(p["name"])
        for la, ln, _, ot, of in ours:
            d = metres(p["lat"], p["lng"], la, ln)
            if d <= 40:
                return True
            if d <= 300 and ((t and ot and len(t & ot) / min(len(t), len(ot)) >= 0.5) or f == of):
                return True
        return False

    out, dropped = [], {}
    def drop(why):
        dropped[why] = dropped.get(why, 0) + 1

    for p in places:
        if not p["name"] or (p["hier"] or [None])[0] not in ("food_and_drink", "lodging"): continue
        if (p["confidence"] or 0) < 0.5: drop("low confidence"); continue
        if p["status"] not in (None, "open"): drop("not open"); continue
        addr = (p["addresses"] or [{}])[0] or {}
        if addr.get("country") not in (None, "SI"): drop("other country"); continue
        if p["tax"] in EXCLUDED_TAXONOMY or BAD_NAME.search(p["name"]): drop("not a venue"); continue
        k = kind_of(p["tax"])
        if not k: drop("unmapped category"); continue
        if known(p): drop("already on our map"); continue
        out.append(
            dict(
                overture_id=p["id"], name=p["name"].strip(), kind=k, lat=round(p["lat"], 7), lng=round(p["lng"], 7),
                address=addr.get("freeform"), city=addr.get("locality"), post_code=addr.get("postcode"),
                phone=(p["phones"] or [None])[0], email=(p["emails"] or [None])[0], website=(p["websites"] or [None])[0],
                confidence=round(p["confidence"], 2),
            )
        )

    os.makedirs(outdir, exist_ok=True)
    cols_sql = ("overture_id text, name text, kind text, lat double precision, lng double precision, address text, "
                "city text, post_code text, phone text, email text, website text, confidence numeric")
    for i in range(0, len(out), 120):
        payload = json.dumps(out[i : i + 120], ensure_ascii=False).replace("'", "''")
        open(f"{outdir}/overture-{i // 120 + 1}.sql", "w", encoding="utf-8").write(
            f"""insert into public.venue (source, overture_id, name, kind, lat, lng, address, city, post_code, phone, email, website, source_confidence, region)
select 'overture', x.overture_id, x.name, x.kind, x.lat, x.lng, x.address, x.city, x.post_code, x.phone, x.email, x.website, x.confidence, '{region}'
from jsonb_to_recordset('{payload}'::jsonb) as x({cols_sql})
on conflict (overture_id) where overture_id is not null do update set
  name = excluded.name, source_confidence = excluded.source_confidence;
"""
        )
    print(f"{len(out)} new places -> {outdir}")
    print("dropped:", dropped)


if __name__ == "__main__":
    main()
