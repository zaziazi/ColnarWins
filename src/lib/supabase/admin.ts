import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses Row Level Security.
 *
 * Use ONLY inside scheduled jobs and server-side integrations — the nightly
 * payment check, the e-Racuni sync, the dunning run. If you ever find yourself
 * importing this from a page or a component, stop: that is the bug.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
