"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff, getRealStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Manager only: say whose customer this is (null = nobody's, e.g. the customers from before Žak). */
export async function setCustomerRep(customerId: string, repId: string | null): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(customerId).success || (repId !== null && !z.string().uuid().safeParse(repId).success)) {
    return { ok: false, error: "Neveljaven vnos." };
  }
  if (isDemoMode) return { ok: true };
  const me = await getRealStaff();
  if (me?.role !== "manager") return { ok: false, error: "Stranke prodajalcem dodeljuje vodstvo." };

  const supabase = await createClient();
  const { error } = await supabase.from("customer").update({ sales_rep_id: repId }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/prodaja/stranke");
  revalidatePath("/prodaja/narocila");
  return { ok: true };
}

const Text = (max: number) => z.string().trim().max(max).optional().default("");

const NewCustomerInput = z
  .object({
    kind: z.enum(["company", "person"]),
    name: Text(160),
    firstName: Text(80),
    lastName: Text(80),
    vatId: Text(20),
    address: z.string().trim().min(1, "Vpiši naslov.").max(160),
    postCode: Text(10),
    city: z.string().trim().min(1, "Vpiši kraj.").max(80),
    phone: Text(40),
    email: z.union([z.literal(""), z.string().trim().email("E-naslov ni veljaven.")]).optional().default(""),
    contactName: Text(120),
    notes: Text(300),
    /** A manager can hand the new customer straight to a salesperson. */
    repId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "company" && !v.name) ctx.addIssue({ code: "custom", message: "Vpiši ime podjetja ali lokala.", path: ["name"] });
    if (v.kind === "person" && (!v.firstName || !v.lastName)) ctx.addIssue({ code: "custom", message: "Vpiši ime in priimek.", path: ["firstName"] });
    if (v.kind === "person" && !v.phone && !v.email) ctx.addIssue({ code: "custom", message: "Vpiši telefon ali e-naslov.", path: ["phone"] });
  });

export type NewCustomerResult = { ok: true; customerId: string; name: string } | { ok: false; error: string };

/**
 * Adds a customer. A salesperson's new customer is his from the start; a manager may pass the salesperson it belongs to.
 * Refuses a customer that already exists (same VAT id, or same name in the same town) and says whose it is.
 */
export async function createCustomer(input: z.input<typeof NewCustomerInput>): Promise<NewCustomerResult> {
  const parsed = NewCustomerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true, customerId: "demo-customer", name: parsed.data.name || "Demo" };

  const me = await getCurrentStaff();
  if (!me || (me.role !== "sales" && me.role !== "manager")) return { ok: false, error: "Stranke dodaja prodaja ali vodstvo." };

  const v = parsed.data;
  const name = v.kind === "person" ? `${v.lastName} ${v.firstName}` : v.name;
  const vat = v.vatId.replace(/\s+/g, "").toUpperCase();
  const supabase = await createClient();

  // who it belongs to, for the "already exists" message
  const owner = async (repId: string | null) => {
    if (!repId) return "nima prodajalca";
    const { data } = await supabase.from("staff").select("full_name").eq("id", repId).single();
    return `stranka: ${data?.full_name ?? "drug prodajalec"}`;
  };

  if (vat) {
    const { data: same } = await supabase.from("customer").select("name,sales_rep_id").ilike("vat_id", vat).limit(1);
    if (same && same.length > 0) return { ok: false, error: `Ta davčna številka že obstaja: ${same[0].name} (${await owner(same[0].sales_rep_id)}).` };
  }
  const { data: sameName } = await supabase.from("customer").select("name,city,sales_rep_id").ilike("name", name).ilike("city", v.city).limit(1);
  if (sameName && sameName.length > 0) return { ok: false, error: `Stranka že obstaja: ${sameName[0].name}, ${sameName[0].city} (${await owner(sameName[0].sales_rep_id)}).` };

  const repId = me.role === "sales" ? me.id : (v.repId ?? null);
  const { data, error } = await supabase
    .from("customer")
    .insert({
      name,
      kind: v.kind,
      first_name: v.kind === "person" ? v.firstName : null,
      last_name: v.kind === "person" ? v.lastName : null,
      vat_id: v.kind === "company" && vat ? vat : null,
      address: v.address,
      post_code: v.postCode || null,
      city: v.city,
      phone: v.phone || null,
      email: v.email || null,
      contact_name: v.kind === "company" ? v.contactName || null : null,
      delivery_notes: v.notes || null,
      payment_terms_days: v.kind === "person" ? 0 : 30,
      active: true,
      sales_rep_id: repId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Stranke ni bilo mogoče shraniti." };

  revalidatePath("/prodaja/stranke");
  revalidatePath("/pregled");
  revalidatePath("/pisarna/novo");
  return { ok: true, customerId: data.id as string, name };
}
