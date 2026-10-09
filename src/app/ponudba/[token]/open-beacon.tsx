"use client";

import * as React from "react";

/** Counts a real open (link-preview bots do not run scripts, so they are not counted). */
export function OpenBeacon({ token }: { token: string }) {
  React.useEffect(() => {
    const key = `offer-open-${token}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked — count anyway
    }
    void fetch("/api/offer-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    });
  }, [token]);
  return null;
}
