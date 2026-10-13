#!/usr/bin/env python3
"""Upload the nationwide venue data through PostgREST (staff login, RLS applies — no service key).

  IMPORT_EMAIL=… IMPORT_PASSWORD=… python3 scripts/si-upload.py <stage> <file.json> [--dry]

stages:  osm       osm_all.json       — insert venues whose (osm_type, osm_id) is not in the database yet
         overture  overture_new.json  — insert places whose overture_id is not in the database yet
         itis      itis_out.json      — patch itis_id/phone onto existing venues, insert the new ones
         ajpes     ajpes_out.json     — patch company data onto existing venues, insert the new ones

Idempotent: it re-reads what is in the database first and only adds what is missing; existing phone,
e-mail and notes are never overwritten (only empty phone/e-mail get filled).
Region: inside the Dolenjska box -> 'dolenjska' (as before), everywhere else -> 'slovenija'.
"""
import json, sys

from pg import PG

BOX = (45.55, 14.7, 46.15, 15.55)


def region(lat, lng):
    return "dolenjska" if BOX[0] <= lat <= BOX[2] and BOX[1] <= lng <= BOX[3] else "slovenija"


def key_index(db):
    idx = {}
    for v in db:
        idx["db:" + v["id"]] = v
        if v.get("osm_id"):
            idx[f"osm:{v['osm_type']}:{v['osm_id']}"] = v
        if v.get("overture_id"):
            idx["ov:" + v["overture_id"]] = v
    return idx


COLS = "id,name,phone,email,osm_type,osm_id,overture_id,itis_id,ajpes_id"


def main():
    stage, path = sys.argv[1], sys.argv[2]
    dry = "--dry" in sys.argv
    pg = PG()
    data = json.load(open(path))
    db = pg.select_all("venue", COLS)
    have_osm = {(v["osm_type"], v["osm_id"]) for v in db if v["osm_id"]}
    have_ov = {v["overture_id"] for v in db if v["overture_id"]}
    have_itis = {v["itis_id"] for v in db if v["itis_id"]}
    have_ajpes = {v["ajpes_id"] for v in db if v["ajpes_id"]}
    idx = key_index(db)
    rows, patches = [], []

    if stage == "osm":
        for r in data:
            if (r["osm_type"], r["osm_id"]) in have_osm:
                continue
            rows.append(dict(r, source="osm", region=region(r["lat"], r["lng"])))
    elif stage == "overture":
        for r in data:
            if r["overture_id"] in have_ov:
                continue
            rows.append(dict(source="overture", overture_id=r["overture_id"], name=r["name"], kind=r["kind"], lat=r["lat"],
                             lng=r["lng"], address=r.get("address"), city=r.get("city"), post_code=(r.get("post_code") or "").strip() or None,
                             phone=r.get("phone"), email=r.get("email"), website=r.get("website"),
                             source_confidence=r.get("confidence"), region=region(r["lat"], r["lng"])))
    elif stage == "itis":
        for f in data["fills"]:
            v = idx.get(f["key"])
            if not v or v["itis_id"]:
                continue
            p = {"itis_id": f["itis_id"]}
            if f.get("phone") and not v["phone"]:
                p["phone"] = f["phone"]
            patches.append((v["id"], p))
        for r in data["new"]:
            if r["itis_id"] in have_itis:
                continue
            rows.append(dict(source="itis", itis_id=r["itis_id"], name=r["name"], kind=r["kind"], lat=r["lat"], lng=r["lng"],
                             address=r.get("address"), city=r.get("city"), post_code=r.get("post_code"), phone=r.get("phone"),
                             region=region(r["lat"], r["lng"]),
                             location_status="ok" if r.get("quality") == "house" else "unverified"))
    elif stage == "ajpes":
        keep = ("ajpes_id", "vat_id", "legal_name", "representative", "revenue_eur", "employees", "skd_code")
        for f in data["fills"]:
            v = idx.get(f["key"])
            if not v or v["ajpes_id"] or f["ajpes_id"] in have_ajpes:
                continue
            p = {k: f[k] for k in keep if f.get(k) is not None}
            if f.get("email") and not v["email"]:
                p["email"] = f["email"]
            if f.get("phone") and not v["phone"]:
                p["phone"] = f["phone"]
            patches.append((v["id"], p))
        for r in data["new"]:
            if r["ajpes_id"] in have_ajpes:
                continue
            rows.append(dict(r, source="ajpes", region=region(r["lat"], r["lng"])))
    else:
        raise SystemExit("unknown stage")

    print(f"{stage}: {len(rows)} to insert, {len(patches)} to patch" + (" (dry run)" if dry else ""))
    if dry:
        return
    n = pg.insert("venue", rows, batch=300) if rows else 0
    for vid, p in patches:
        pg.patch("venue", {"id": vid}, p)
    print(f"inserted {n}, patched {len(patches)}")


if __name__ == "__main__":
    main()
