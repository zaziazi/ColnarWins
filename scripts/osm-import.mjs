#!/usr/bin/env node
/**
 * Pulls restaurants, bars, cafés, hotels … for a region out of OpenStreetMap
 * (Overpass API) and writes SQL that upserts them into `venue`.
 *
 *   node scripts/osm-import.mjs --region dolenjska --bbox 45.55,14.7,46.15,15.55 --out ./venue-sql
 *
 * Output is a few `venues-N.sql` files, each one self-contained statement.
 * Re-running is safe: the upsert only refreshes OSM-derived columns (name,
 * coordinates, address, website, opening hours, raw tags) and never touches
 * phone / email / contact_name / note, which the sales team owns.
 *
 * Data © OpenStreetMap contributors, ODbL — keep the attribution on the map.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const region = args.region ?? "dolenjska";
const bbox = args.bbox ?? "45.55,14.7,46.15,15.55"; // south,west,north,east
const outDir = args.out ?? "./venue-sql";
// --json writes the raw rows for the PostgREST uploader.
const jsonOut = args.json ?? null;
const CHUNK = 200;

const MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// --tiles RxC splits the box into many small Overpass requests (a whole country in one query times out),
// --polygon country.geojson (Nominatim polygon_geojson) skips tiles outside the country and drops
// neighbouring-country points that fall inside the box.
const tiles = (args.tiles ?? "1x1").split("x").map(Number);
const [S, W, N, E] = bbox.split(",").map(Number);
let ring = null;
if (args.polygon) {
  const g = JSON.parse(readFileSync(args.polygon, "utf8")).features[0].geometry;
  ring = (g.type === "MultiPolygon" ? g.coordinates[0] : g.coordinates)[0]; // outer ring of the main polygon, [lng, lat]
}
function inside(lat, lng) {
  if (!ring) return true;
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function queryFor(box) {
  return `[out:json][timeout:120];
(
  nwr["amenity"~"^(restaurant|bar|pub|cafe|fast_food)$"](${box});
  nwr["tourism"~"^(hotel|guest_house)$"](${box});
  nwr["shop"="wine"](${box});
);
out tags center;`;
}

async function fetchOverpass(query) {
  for (let round = 0; round < 4; round++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)", "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(150_000),
        });
        if (res.ok) {
          const json = await res.json();
          // Overpass answers 200 with an empty list and a "remark" when the query ran out of time/memory.
          if (json.remark && /error|timed out|out of memory/i.test(json.remark)) {
            console.error(`${url} -> ${json.remark}`);
            continue;
          }
          return json;
        }
        console.error(`${url} -> ${res.status}`);
      } catch (e) {
        console.error(`${url} -> ${e.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error("All Overpass mirrors failed");
}

async function fetchAll() {
  const [R, C] = tiles;
  const seen = new Map();
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const b = [S + ((N - S) * r) / R, W + ((E - W) * c) / C, S + ((N - S) * (r + 1)) / R, W + ((E - W) * (c + 1)) / C];
      if (ring) {
        let any = false;
        for (let i = 0; i <= 4 && !any; i++) for (let j = 0; j <= 4 && !any; j++) any = inside(b[0] + ((b[2] - b[0]) * i) / 4, b[1] + ((b[3] - b[1]) * j) / 4);
        if (!any) continue;
      }
      const box = b.map((x) => x.toFixed(4)).join(",");
      const part = await fetchOverpass(queryFor(box));
      for (const el of part.elements) seen.set(`${el.type}/${el.id}`, el);
      console.error(`tile ${r + 1}x${c + 1} (${box}): ${part.elements.length} elements, total ${seen.size}`);
      await new Promise((res) => setTimeout(res, 2_000));
    }
  }
  return { elements: [...seen.values()].filter((el) => inside(el.lat ?? el.center?.lat, el.lon ?? el.center?.lon)) };
}

const KEEP_TAGS = ["cuisine", "stars", "outdoor_seating", "operator"];

function kindOf(t) {
  if (["restaurant", "bar", "pub", "cafe", "fast_food"].includes(t.amenity)) return t.amenity;
  if (t.tourism === "hotel") return "hotel";
  if (t.tourism === "guest_house") return "guest_house";
  if (t.shop === "wine") return "wine_shop";
  return null;
}

const first = (v) => (v ? String(v).split(";")[0].trim() : null);

const data = await fetchAll();
const rows = [];
for (const el of data.elements) {
  const t = el.tags ?? {};
  const name = t.name?.trim();
  const kind = kindOf(t);
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || !kind || lat == null || lng == null) continue; // an unnamed venue is useless for sales

  rows.push({
    osm_type: el.type,
    osm_id: el.id,
    name,
    kind,
    lat,
    lng,
    address: [t["addr:street"] ?? t["addr:place"], t["addr:housenumber"]].filter(Boolean).join(" ") || null,
    city: t["addr:city"] ?? null,
    post_code: t["addr:postcode"] ?? null,
    website: first(t.website ?? t["contact:website"] ?? t.url),
    opening_hours: t.opening_hours ?? null,
    phone: first(t.phone ?? t["contact:phone"] ?? t["contact:mobile"]),
    email: first(t.email ?? t["contact:email"]),
    osm_tags: Object.fromEntries(KEEP_TAGS.filter((k) => t[k]).map((k) => [k, t[k]])),
  });
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows));
mkdirSync(outDir, { recursive: true });
const cols = `osm_type text, osm_id bigint, name text, kind text, lat double precision, lng double precision,
  address text, city text, post_code text, website text, opening_hours text, phone text, email text, osm_tags jsonb`;

let n = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const json = JSON.stringify(rows.slice(i, i + CHUNK).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && !(typeof v === "object" && Object.keys(v).length === 0))))).replace(/'/g, "''");
  const sql = `insert into public.venue
  (osm_type, osm_id, name, kind, lat, lng, address, city, post_code, website, opening_hours, phone, email, osm_tags, region)
select x.osm_type, x.osm_id, x.name, x.kind, x.lat, x.lng, x.address, x.city, x.post_code, x.website, x.opening_hours,
       x.phone, x.email, x.osm_tags, '${region}'
from jsonb_to_recordset('${json}'::jsonb) as x(${cols})
on conflict (osm_type, osm_id) do update set
  name = excluded.name, kind = excluded.kind, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, city = coalesce(excluded.city, public.venue.city),
  post_code = coalesce(excluded.post_code, public.venue.post_code),
  website = excluded.website, opening_hours = excluded.opening_hours,
  osm_tags = excluded.osm_tags, region = excluded.region;`;
  writeFileSync(`${outDir}/venues-${++n}.sql`, sql);
}

// Checksum over identity + position so the applied data can be verified byte-for-byte.
import { createHash } from "node:crypto";
const sum = createHash("md5").update(rows.map((r) => `${r.osm_type}:${r.osm_id}:${r.lat}:${r.lng}:${r.name}`).sort().join("\n")).digest("hex");
console.log("checksum", sum);

const byKind = rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {});
console.log(`region=${region} elements=${data.elements.length} named=${rows.length} files=${n}`, byKind);
console.log(`with phone ${rows.filter((r) => r.phone).length}, email ${rows.filter((r) => r.email).length}, address ${rows.filter((r) => r.address).length}`);
