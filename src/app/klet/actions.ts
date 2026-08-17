"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const AdjustVesselInput = z.object({
  vesselId: z.string().min(1),
  deltaL: z.number().refine((n) => n !== 0, "Vnesi količino, ki ni nič."),
  note: z.string().max(300).optional().default(""),
});

export async function adjustVessel(input: z.infer<typeof AdjustVesselInput>): Promise<ActionResult> {
  const parsed = AdjustVesselInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven popravek." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_vessel_adjustment", {
    p_vessel_id: parsed.data.vesselId,
    p_delta_l: parsed.data.deltaL,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  return { ok: true };
}

const HarvestIntakeInput = z.object({
  vesselId: z.string().min(1),
  productId: z.string().min(1),
  volumeL: z.number().positive(),
  note: z.string().max(300).optional().default(""),
});

export async function recordHarvestIntake(
  input: z.infer<typeof HarvestIntakeInput>,
): Promise<ActionResult> {
  const parsed = HarvestIntakeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven sprejem." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_harvest_intake", {
    p_vessel_id: parsed.data.vesselId,
    p_product_id: parsed.data.productId,
    p_volume_l: parsed.data.volumeL,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  return { ok: true };
}

const BottlingRunInput = z.object({
  vesselId: z.string().min(1),
  litersConsumed: z.number().positive(),
  bottlesProduced: z.number().int().positive(),
  note: z.string().max(300).optional().default(""),
});

export async function recordBottlingRun(
  input: z.infer<typeof BottlingRunInput>,
): Promise<ActionResult> {
  const parsed = BottlingRunInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavno stekleničenje." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_bottling_run", {
    p_vessel_id: parsed.data.vesselId,
    p_liters_consumed: parsed.data.litersConsumed,
    p_bottles_produced: parsed.data.bottlesProduced,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  return { ok: true };
}

const CreateVesselInput = z.object({
  name: z.string().min(1).max(60),
  capacityL: z.number().positive(),
});

export async function createVessel(input: z.infer<typeof CreateVesselInput>): Promise<ActionResult> {
  const parsed = CreateVesselInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven rezervoar." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vessel")
    .insert({ name: parsed.data.name, capacity_l: parsed.data.capacityL });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  return { ok: true };
}
