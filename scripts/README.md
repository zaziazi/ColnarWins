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

## 3. Matching

`select public.match_venues_to_customers('dolenjska');` links venues to
customers by distance plus name similarity. Confirmed links, rejections and
manual edits survive a re-run; automatic links are recomputed.

## Map worker

`public/maplibre-gl-worker.mjs` is copied from
`node_modules/maplibre-gl/dist/` and must match the pinned `maplibre-gl`
version. Copy it again whenever that package is upgraded.
