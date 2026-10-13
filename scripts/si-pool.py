#!/usr/bin/env python3
"""Build the venue pool for the nationwide merge: what is in the database plus what is about to be added.

  python3 scripts/si-pool.py venues_now.json osm_all.json overture_new.json  pool.json have.csv

osm_all.json       rows from `osm-import.mjs --json`
overture_new.json  rows from `overture-import.py --json` (already deduped against the have.csv of a previous pass)
Writes pool.json (see itis-nationwide.py) and, for the Overture dedupe, have.csv ("lat,lng,name"
of venues in the database + the new OSM rows).
"""
import json, sys


def main():
    now = json.load(open(sys.argv[1]))
    osm = json.load(open(sys.argv[2]))
    ov = json.load(open(sys.argv[3])) if len(sys.argv) > 3 and sys.argv[3] != "-" else []
    have = {(v["osm_type"], v["osm_id"]) for v in now if v.get("osm_id")}
    pool = [dict(key="db:" + v["id"], name=v["name"], lat=v["lat"], lng=v["lng"], phone=v["phone"], city=v["city"],
                 post_code=v["post_code"], db_id=v["id"], itis_id=v["itis_id"], ajpes_id=v["ajpes_id"]) for v in now]
    new_osm = [r for r in osm if (r["osm_type"], r["osm_id"]) not in have]
    pool += [dict(key=f"osm:{r['osm_type']}:{r['osm_id']}", name=r["name"], lat=r["lat"], lng=r["lng"], phone=r.get("phone"),
                  city=r.get("city"), post_code=r.get("post_code"), db_id=None, itis_id=None, ajpes_id=None) for r in new_osm]
    pool += [dict(key="ov:" + o["overture_id"], name=o["name"], lat=o["lat"], lng=o["lng"], phone=o.get("phone"),
                  city=o.get("city"), post_code=o.get("post_code"), db_id=None, itis_id=None, ajpes_id=None) for o in ov]
    json.dump(pool, open(sys.argv[4 if len(sys.argv) > 4 else 3], "w"), ensure_ascii=False)
    if len(sys.argv) > 5:
        with open(sys.argv[5], "w", encoding="utf-8") as f:
            for v in now:
                f.write(f"{v['lat']},{v['lng']},{v['name'].replace(chr(10), ' ')}\n")
            for r in new_osm:
                f.write(f"{r['lat']},{r['lng']},{r['name'].replace(chr(10), ' ')}\n")
    print(f"pool {len(pool)}: db {len(now)}, new osm {len(new_osm)}, new overture {len(ov)}")


if __name__ == "__main__":
    main()
