#!/usr/bin/env python3
"""Collect the "Gostilne in restavracije" listing from iTIS (Telefonski imenik Slovenije).

Used with TSmedia's permission (user confirmed 2026-10-09). Only the public listing
pages are fetched (the robots.txt-disallowed company cards are not), one page every
~1.5 s with an identifying User-Agent. Output: itis.json (list of dicts) in OUT dir.

  python3 scripts/itis-scrape.py OUT_DIR [first_page last_page]
"""
import html, json, os, re, sys, time, urllib.request

BASE = "https://itis.siol.net/dejavnost/Gostilne-in-restavracije"
UA = "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)"


def fetch(page):
    url = BASE if page == 1 else f"{BASE}/stran-{page}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", page, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"page {page} failed")


def text(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def parse(page_html):
    out = []
    for block in re.split(r'<div id="CPH_bodyMain_SearchResultsStatic1_RepeaterResults_Item1_\d+_divISimWh_\d+"', page_html)[1:]:
        g = lambda pat: (re.search(pat, block, re.S) or [None, None])[1]
        loc = g(r'<div class="location">(.*?)</div>') or ""
        loc = re.sub(r"<br\s*/?>", "|", loc)
        parts = [text(p) for p in loc.split("|") if text(p)]
        phones = re.findall(r'<div class="nr">(.*?)</div>', block, re.S)
        mails = re.findall(r'mailto:([^"\'?\s]+)', block) or re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', block)
        out.append({
            "itis_id": g(r'hfdIISimWhID_\d+" value="(\d+)"'),
            "rn": g(r'hfdIISimWhRN_\d+" value="(\d+)"'),
            "name": text(g(r'labISimWhTitle_\d+">(.*?)</span>') or ""),
            "phones": [text(p) for p in phones],
            "emails": sorted({m.lower() for m in mails}),
            "address": parts[0].rstrip(",") if parts else None,
            "place": parts[-1] if parts else None,
        })
    return out


if __name__ == "__main__":
    out_dir = sys.argv[1]
    first = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    last = int(sys.argv[3]) if len(sys.argv) > 3 else 136
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for p in range(first, last + 1):
        page_rows = parse(fetch(p))
        for r in page_rows:
            r["page"] = p
        rows += page_rows
        print(p, len(page_rows), len(rows), flush=True)
        time.sleep(1.5)
    json.dump(rows, open(os.path.join(out_dir, "itis.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
