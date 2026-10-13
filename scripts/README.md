# Prodaja data loading

How the sales map was filled (Dolenjska first). Neither step needs the Supabase
service key — the SQL is applied through the Supabase SQL tool.

## 1. Venues — `osm-import.mjs`

```bash
node scripts/osm-import.mjs --region dolenjska --bbox 45.55,14.7,46.15,15.55 --out ./venue-sql
```

Pulls restaurants, bars, pubs, cafés, fast food, hotels, guest houses and wine
shops from OpenStreetMap (Overpass API, mirror fallback) and writes
`venues-N.sql` upserts. Re-running refreshes OSM-derived columns only; phone,
email, contact person and notes entered by the sales team are never touched.
The script prints a checksum — compare it to the database after applying:

```sql
select md5(string_agg(osm_type || ':' || osm_id || ':' || lat || ':' || lng || ':' || name,
  E'\n' order by (osm_type || ':' || osm_id || ':' || lat || ':' || lng || ':' || name) collate "C"))
from public.venue;
```

Data © OpenStreetMap contributors (ODbL) — attribution stays on the map.

## overture-import.py

Adds hospitality places from Overture Maps (DuckDB over the public S3
release; the same sources eMENI shows: OSM + Meta + Foursquare + others) that
are not yet in `venue`, filtered by category/confidence/operating status.
Emits `overture-N.sql` upserts keyed on `overture_id`. Data © Overture Maps
Foundation, CDLA-Permissive-2.0 — keep the attribution.

## 2. Customer positions — `geocode-customers.sql`

Customers have addresses but no coordinates. `geocode-customers.sql` is a
temporary function that asks Nominatim (1 request/second, identifying
User-Agent) from inside the database, 70 customers per call (the SQL tool times
out at ~100). It needs the `http` extension for the duration of the run:

```sql
create extension http with schema extensions;
-- create the function from geocode-customers.sql, then repeat until remaining = 0:
select public.tmp_geocode_batch(70);
-- clean up:
drop function public.tmp_geocode_batch(int);
drop extension http;
```

Only customers with a 4-digit (Slovenian) post code are geocoded. Each result
records its precision (`house` / `street` / `city`); only house/street results
are used for matching and shown on the map.

## 3. Company register (AJPES) — `ajpes-import.py`

The AJPES/Bisnode export (`2025-03-10 AJPES Register.xlsx`) lists companies
with VAT number, phone, e-mail, representative, revenue and activity code, but
**no town or post code**. The script therefore:

1. `extract` — keeps hospitality businesses (SKD 55.x accommodation, 56.x food & drink; 481 nationwide);
2. `locate` — geocodes each street address *inside the region's box only* and
   records evidence that it really is in the region: the best match anywhere in
   Slovenia is the same place (`unique`), a regional phone prefix (`phone`), a
   customer with the same VAT number in a regional post code (`customer-vat`),
   or a regional town in the name/address (`town-name`). Businesses with a
   result but no evidence are skipped (generic street names exist everywhere);
3. `sql` — writes upserts: a business that is already on the map (close + similar
   name) gets its company data merged in; otherwise it is added as a new venue.

Exact VAT matching then links venues to customers with certainty
(`match_venues_to_customers`).

## 4. Matching

`select public.match_venues_to_customers('dolenjska');` links venues to
customers by distance plus name similarity. Confirmed links, rejections and
manual edits survive a re-run; automatic links are recomputed.

## Map worker

`public/maplibre-gl-worker.mjs` is copied from
`node_modules/maplibre-gl/dist/` and must match the pinned `maplibre-gl`
version. Copy it again whenever that package is upgraded.

## itis-scrape.py / itis-locate.py

iTIS (Telefonski imenik Slovenije, TSmedia) category "Gostilne in restavracije":
`itis-scrape.py` reads the public listing pages (never the robots.txt-disallowed
company cards; ~1.5 s/page, identifying User-Agent) and `itis-locate.py`
geocodes the Dolenjska rows via Nominatim, drops ones already on the map and
emits the import payload. Used with TSmedia's permission (confirmed by the
owner, 2026-10-09) — do not run it for other purposes without asking them again.
Rows matched to an existing venue only add a phone number; new ones get
`source = 'itis'` and `location_status = 'unverified'` when only the town was found.

## degustacije-gmail-forwarder.gs

Google Apps Script for the tastings mailbox: forwards every new e-mail (the
website reservation form lands there) to `/api/degustacije/inbound`. Setup
steps are at the top of the file. Needs `DEGUSTACIJE_INBOUND_SECRET` in Vercel.


## Nationwide load (all of Slovenia, 2026-10-13)

Same sources as Dolenjska, scaled up. Nothing needs the Supabase service key: the scripts sign in as a staff
user (`IMPORT_EMAIL`/`IMPORT_PASSWORD`, a throwaway manager login) and write through PostgREST, so no SQL has to
be retyped. Working files live outside the repo.

```bash
# 1. OpenStreetMap — Overpass is unreliable for a whole country; use the Geofabrik extract (pip install osmium)
curl -L -o slovenia.osm.pbf https://download.geofabrik.de/europe/slovenia-latest.osm.pbf
curl -s "https://nominatim.openstreetmap.org/search?country=slovenia&format=geojson&polygon_geojson=1&polygon_threshold=0.002&limit=1" -o si_poly.json
python3 scripts/osm-pbf-import.py slovenia.osm.pbf osm_all.json si_poly.json

# 2. what we already have, then Overture (deduped against it)
python3 - <<'PY'   # venues_now.json via scripts/pg.py PG().select_all('venue', ...)
PY
python3 scripts/si-pool.py venues_now.json osm_all.json - pool_osm.json have.csv
python3 scripts/overture-import.py have.csv ov-sql --bbox 45.42,13.37,46.88,16.61 --region slovenija \
        --raw overture_raw.json --json overture_new.json
python3 scripts/si-pool.py venues_now.json osm_all.json overture_new.json pool.json

# 3. upload (idempotent; only adds what is missing)
python3 scripts/si-upload.py osm osm_all.json
python3 scripts/si-upload.py overture overture_new.json

# 4. iTIS (listing from itis-scrape.py) and AJPES — Nominatim, 1 request/s, resumable via the cache file
python3 scripts/itis-nationwide.py itis.json pool.json itis_geocache.jsonl itis_out.json
python3 scripts/si-upload.py itis itis_out.json
python3 scripts/ajpes-import.py extract "2025-03-10 AJPES Register.xlsx" hosp.json
python3 scripts/ajpes-nationwide.py hosp.json pool.json ajpes_geocache.jsonl ajpes_out.json
python3 scripts/si-upload.py ajpes ajpes_out.json

# 5. towns for venues without addr:city (nearest settlement within 3 km), then customer matching
python3 scripts/fill-city.py slovenia.osm.pbf places.json && python3 scripts/fill-city.py --apply places.json
```

Then `select match_venues_to_customers('slovenija'); select match_venues_to_customers('dolenjska');`.
Region is `dolenjska` inside the old test box and `slovenija` elsewhere.
