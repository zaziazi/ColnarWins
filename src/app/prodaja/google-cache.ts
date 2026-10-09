"use client";

import * as React from "react";
import type { GoogleLookup } from "@/lib/google-places";
import { getGoogleInfos } from "./actions";

/**
 * Google answers are kept only in this browser tab's memory/session (gone when
 * the tab closes) — never in our database — so reloading a page does not buy
 * the same rating twice. Errors and "limit" answers are not kept.
 */
const memory = new Map<string, GoogleLookup>();
const KEY = "colnix-google-lookups";
/** Set when the server says Google is not configured; not persisted, so a new page load asks again. */
let notConfigured = false;

function hydrate() {
  if (memory.size > 0) return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, GoogleLookup>)) memory.set(k, v);
  } catch {
    // no session storage — memory only
  }
}

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // ignore
  }
}

export function cachedGoogle(id: string): GoogleLookup | undefined {
  hydrate();
  return memory.get(id);
}

export function rememberGoogle(id: string, v: GoogleLookup) {
  if (v.status === "unconfigured") notConfigured = true;
  if (v.status === "error" || v.status === "limit" || v.status === "unconfigured") return;
  memory.set(id, v);
  persist();
}

/**
 * Ratings for a list of venue ids. With `auto`, missing ones are fetched as
 * soon as the list appears; otherwise call `load()` (a button).
 */
export function useGoogleRatings(ids: string[], auto: boolean) {
  const key = ids.join(",");
  const [, bump] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const missing = React.useMemo(() => {
    hydrate();
    return ids.filter((id) => !memory.has(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading]);

  const load = React.useCallback(async () => {
    const todo = missing.slice(0, 20);
    if (todo.length === 0) return;
    setLoading(true);
    setProblem(null);
    try {
      const res = await getGoogleInfos(todo);
      for (const [id, v] of Object.entries(res)) {
        rememberGoogle(id, v);
        if (v.status === "limit") setProblem("Mesečna omejitev Google iskanj je dosežena.");
        if (v.status === "error") setProblem("Google iskanje ni uspelo.");
      }
    } finally {
      setLoading(false);
      bump((n) => n + 1);
    }
  }, [missing]);

  React.useEffect(() => {
    if (auto && missing.length > 0 && !loading && !problem && !notConfigured) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, key]);

  const lookups = new Map<string, GoogleLookup>();
  for (const id of ids) {
    const v = memory.get(id);
    if (v) lookups.set(id, v);
  }
  const configured = !notConfigured;
  return { lookups, loading, load, missing: missing.length, configured, problem };
}
