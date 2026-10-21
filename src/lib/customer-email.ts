import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** An e-mail typed on the order form is kept on the customer, so the next order and the documents find it. */
export async function saveCustomerEmail(
  supabase: Db,
  customerId: string,
  email: string | null | undefined,
): Promise<void> {
  const e = (email ?? "").trim();
  if (!e) return;
  await supabase.from("customer").update({ email: e }).eq("id", customerId).neq("email", e);
  await supabase.from("customer").update({ email: e }).eq("id", customerId).is("email", null);
}

