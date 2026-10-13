"""Tiny PostgREST client for the nationwide venue loaders (stdlib only).

Signs in as a staff user (RLS applies — no service key needed) using
IMPORT_EMAIL / IMPORT_PASSWORD; URL and anon key come from .env.local.
"""
import json, os, re, time, urllib.error, urllib.parse, urllib.request


def env_local():
    out = {}
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env.local"), encoding="utf-8"):
        m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


class PG:
    def __init__(self):
        env = env_local()
        self.url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        self.anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
        self.token = None
        self.login()

    def _req(self, method, path, body=None, headers=None, auth=True):
        h = {"apikey": self.anon, "Content-Type": "application/json", **(headers or {})}
        if auth and self.token:
            h["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(self.url + path, data=data, method=method, headers=h), timeout=120) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")
                if e.code in (401,) and attempt == 0 and auth:
                    self.login(); h["Authorization"] = f"Bearer {self.token}"; continue
                if e.code >= 500 and attempt < 3:
                    time.sleep(2 * (attempt + 1)); continue
                raise RuntimeError(f"{method} {path} -> {e.code}: {msg[:400]}")
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"{method} {path} failed")

    def login(self):
        r = self._req("POST", "/auth/v1/token?grant_type=password",
                      {"email": os.environ["IMPORT_EMAIL"], "password": os.environ["IMPORT_PASSWORD"]}, auth=False)
        self.token = r["access_token"]

    def select_all(self, table, select, extra=""):
        rows, start = [], 0
        while True:
            page = self._req("GET", f"/rest/v1/{table}?select={urllib.parse.quote(select)}{extra}&order=id",
                             headers={"Range-Unit": "items", "Range": f"{start}-{start + 999}"})
            rows += page
            if len(page) < 1000:
                return rows
            start += 1000

    def insert(self, table, rows, batch=500):
        """Plain insert; every row in a batch must have the same keys, so keys are normalised per batch."""
        n = 0
        for i in range(0, len(rows), batch):
            chunk = rows[i:i + batch]
            keys = sorted({k for r in chunk for k in r})
            chunk = [{k: r.get(k) for k in keys} for r in chunk]
            self._req("POST", f"/rest/v1/{table}", chunk, headers={"Prefer": "return=minimal"})
            n += len(chunk)
        return n

    def patch(self, table, match, values):
        q = "&".join(f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in match.items())
        self._req("PATCH", f"/rest/v1/{table}?{q}", values, headers={"Prefer": "return=minimal"})
