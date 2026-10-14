#!/usr/bin/env python3
"""Update the customer table from an e-računi partner export (.xls).

  IMPORT_EMAIL=… IMPORT_PASSWORD=… python3 scripts/customers-xls-import.py partners.xls [--apply] [--geocode]

Matching, in order:
  1. same davčna številka (digits)                         -> update that customer
  2. no VAT on our side, same street + post code, similar name -> update that customer (fills the VAT)
  3. otherwise                                              -> new customer
Updates only touch name, address, post code, town, VAT (VAT only when ours is empty) and phone (only
when ours is empty); everything the office edited (e-mail, notes, payment terms, credit hold…) stays.
Without --apply it only prints what it would do. --geocode afterwards places customers that have no
position yet (Nominatim, 1 request/s) so they appear on the sales map and can be linked to venues.
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request

import xlrd

sys.path.insert(0, __import__("os").path.dirname(__file__))
from pg import PG  # noqa: E402

UA = "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)"
digits = lambda s: re.sub(r"\D", "", s or "")


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


STOP = set("d o s p doo gostinstvo storitve trgovina in pe p e podjetje".split())
toks = lambda s: {t for t in fold(s).split() if len(t) > 2 and t not in STOP}


def read_xls(path):
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    out = []
    for r in range(1, sh.nrows):
        v = [str(x).strip() for x in sh.row_values(r)]
        name = v[1] or " ".join(x for x in (v[3], v[2]) if x)  # private persons: Ime Priimek
        if not name:
            continue
        tax, vat = digits(v[9]), v[10].strip()
        out.append(dict(name=name, street=v[4], pc=v[5], city=v[6], phone=v[7] or v[19] or None,
                        vat=vat or (tax or None), tax=tax, country=v[21]))
    return out


def classify(rows, db):
    by_vat = {}
    for c in db:
        k = digits(c["vat_id"])
        if k:
            by_vat.setdefault(k, []).append(c)
    updates, new = [], []
    taken = set()
    for r in rows:
        k = r["tax"] or digits(r["vat"])
        cand = [c for c in by_vat.get(k, []) if c["id"] not in taken] if k else []
        c = None
        if cand:
            c = max(cand, key=lambda x: len(toks(x["name"]) & toks(r["name"])))
        else:
            t = toks(r["name"])
            for x in db:
                if x["id"] in taken:
                    continue
                same_place = (x["post_code"] or "") == r["pc"] and fold(x["address"]) == fold(r["street"])
                xt = toks(x["name"])
                similar = bool(t and xt and len(t & xt) / min(len(t), len(xt)) >= 0.6)
                # our side has no VAT: same place + similar name, or the very same name
                if not x["vat_id"] and ((same_place and similar) or fold(x["name"]) == fold(r["name"])):
                    c = x
                    break
                # the export row has no VAT (private person / typed by hand): same place + similar name
                if not r["vat"] and same_place and similar:
                    c = x
                    break
        if c:
            taken.add(c["id"])
            patch = {}
            for field, new_v in (("name", r["name"]), ("address", r["street"] or None),
                                 ("post_code", r["pc"] or None), ("city", r["city"] or None)):
                if new_v and (c[field] or "").strip().upper() != new_v.strip().upper():
                    patch[field] = new_v
            if not c["vat_id"] and r["vat"]:
                patch["vat_id"] = r["vat"]
            if not c["phone"] and r["phone"]:
                patch["phone"] = r["phone"]
            if "address" in patch or "post_code" in patch or "city" in patch:
                patch.update(lat=None, lng=None, geocode_quality=None, geocoded_at=None)  # re-place it
            if patch:
                updates.append((c, patch))
        else:
            new.append(r)
    return updates, new


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        dict(q=q, format="jsonv2", limit=1, countrycodes="si", addressdetails=1))
    for i in range(4):
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
            time.sleep(1.1)
            return res[0] if res else None
        except Exception:
            time.sleep(3 * (i + 1))
    return None


def geocode(pg):
    todo = pg.select_all("customer", "id,address,post_code,city,lat", "&lat=is.null")
    todo = [c for c in todo if re.fullmatch(r"\d{4}", c["post_code"] or "")]
    print(f"{len(todo)} customers to place")
    ok = 0
    for c in todo:
        q = f"{c['address'] or ''}, {c['post_code']} {c['city'] or ''}".strip(", ")
        h = nominatim(q)
        quality = "house" if h and h.get("address", {}).get("house_number") else "street"
        if not h or (h.get("address", {}).get("postcode") and h["address"]["postcode"] != c["post_code"]):
            h = nominatim(f"{c['post_code']} {c['city'] or ''}")
            quality = "city"
        if not h:
            continue
        pg.patch("customer", {"id": c["id"]}, dict(lat=float(h["lat"]), lng=float(h["lon"]), geocode_quality=quality,
                                                   geocoded_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))
        ok += 1
    print("placed", ok)


def main():
    path = sys.argv[1]
    apply = "--apply" in sys.argv
    pg = PG()
    if "--geocode" in sys.argv:
        return geocode(pg)
    rows = read_xls(path)
    db = pg.select_all("customer", "id,name,vat_id,address,post_code,city,phone")
    updates, new = classify(rows, db)
    print(f"xls rows {len(rows)} | customers in app {len(db)} | to update {len(updates)} | to add {len(new)}")
    for c, p in updates[:6]:
        print("  update", c["name"][:40], {k: v for k, v in p.items() if k not in ("lat", "lng", "geocode_quality", "geocoded_at")})
    for r in new[:6]:
        print("  new   ", r["name"][:50], r["street"], r["pc"], r["city"], r["vat"])
    if not apply:
        return
    for c, p in updates:
        pg.patch("customer", {"id": c["id"]}, p)
    pg.insert("customer", [dict(name=r["name"], vat_id=r["vat"], address=r["street"] or None, post_code=r["pc"] or None,
                                city=r["city"] or None, phone=r["phone"]) for r in new], batch=100)
    print(f"updated {len(updates)}, added {len(new)}")


if __name__ == "__main__":
    main()
