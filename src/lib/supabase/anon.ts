import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-less client for token-protected public pages (offer link, calendar
 * feed). It can do nothing but call the SECURITY DEFINER functions that were
 * explicitly granted to `anon`.
 */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
