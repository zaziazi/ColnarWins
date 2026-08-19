"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function currentStaffId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("staff").select("id").eq("auth_user_id", user.id).single();
  return data?.id ?? null;
}

const HarvestIntakeInput = z.object({
  vesselId: z.string().min(1),
  name: z.string().min(1).max(120),
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
    p_name: parsed.data.name,
    p_volume_l: parsed.data.volumeL,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  revalidatePath("/klet/rezervoarji");
  return { ok: true };
}

const TransferInput = z.object({
  lotId: z.string().min(1),
  toVesselId: z.string().min(1),
  note: z.string().max(300).optional().default(""),
});

export async function transferWineLot(input: z.infer<typeof TransferInput>): Promise<ActionResult> {
  const parsed = TransferInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven prenos." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_wine_lot", {
    p_lot_id: parsed.data.lotId,
    p_to_vessel_id: parsed.data.toVesselId,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  revalidatePath("/klet/rezervoarji");
  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const ReadingInput = z
  .object({
    lotId: z.string().min(1),
    sugarGl: z.number().optional(),
    ph: z.number().optional(),
    so2: z.number().optional(),
    malicAcid: z.number().optional(),
    tartaricAcid: z.number().optional(),
    lacticAcid: z.number().optional(),
    totalAcid: z.number().optional(),
    volatileAcid: z.number().optional(),
    co2: z.number().optional(),
    alcohol: z.number().optional(),
    density: z.number().optional(),
    note: z.string().max(300).optional().default(""),
  })
  .refine(
    (v) =>
      v.sugarGl !== undefined ||
      v.ph !== undefined ||
      v.so2 !== undefined ||
      v.malicAcid !== undefined ||
      v.tartaricAcid !== undefined ||
      v.lacticAcid !== undefined ||
      v.totalAcid !== undefined ||
      v.volatileAcid !== undefined ||
      v.co2 !== undefined ||
      v.alcohol !== undefined ||
      v.density !== undefined ||
      v.note !== "",
    { message: "Vnesi vsaj eno meritev ali opombo." },
  );

export async function recordLotReading(input: z.infer<typeof ReadingInput>): Promise<ActionResult> {
  const parsed = ReadingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavna meritev." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_wine_lot_reading", {
    p_lot_id: parsed.data.lotId,
    p_sugar_gl: parsed.data.sugarGl ?? null,
    p_ph: parsed.data.ph ?? null,
    p_so2: parsed.data.so2 ?? null,
    p_malic_acid: parsed.data.malicAcid ?? null,
    p_tartaric_acid: parsed.data.tartaricAcid ?? null,
    p_lactic_acid: parsed.data.lacticAcid ?? null,
    p_total_acid: parsed.data.totalAcid ?? null,
    p_volatile_acid: parsed.data.volatileAcid ?? null,
    p_co2: parsed.data.co2 ?? null,
    p_alcohol: parsed.data.alcohol ?? null,
    p_density: parsed.data.density ?? null,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const AdditionInput = z.object({
  lotId: z.string().min(1),
  additiveName: z.string().min(1, "Vnesi, kaj je bilo dodano."),
  amount: z.number().optional(),
  unit: z.string().max(20).optional(),
  note: z.string().max(300).optional().default(""),
});

export async function recordLotAddition(input: z.infer<typeof AdditionInput>): Promise<ActionResult> {
  const parsed = AdditionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven dodatek." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_wine_lot_addition", {
    p_lot_id: parsed.data.lotId,
    p_additive_name: parsed.data.additiveName,
    p_amount: parsed.data.amount ?? null,
    p_unit: parsed.data.unit || null,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const AdjustVolumeInput = z.object({
  lotId: z.string().min(1),
  deltaL: z.number().refine((n) => n !== 0, "Vnesi količino, ki ni nič."),
  note: z.string().max(300).optional().default(""),
});

export async function adjustLotVolume(input: z.infer<typeof AdjustVolumeInput>): Promise<ActionResult> {
  const parsed = AdjustVolumeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven popravek." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_wine_lot_volume", {
    p_lot_id: parsed.data.lotId,
    p_delta_l: parsed.data.deltaL,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const BottlingInput = z.object({
  lotId: z.string().min(1),
  productId: z.string().min(1),
  litersConsumed: z.number().positive(),
  bottlesProduced: z.number().int().positive(),
  note: z.string().max(300).optional().default(""),
});

export async function recordLotBottling(input: z.infer<typeof BottlingInput>): Promise<ActionResult> {
  const parsed = BottlingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavno stekleničenje." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_lot_bottling_run", {
    p_lot_id: parsed.data.lotId,
    p_product_id: parsed.data.productId,
    p_liters_consumed: parsed.data.litersConsumed,
    p_bottles_produced: parsed.data.bottlesProduced,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet");
  revalidatePath("/klet/rezervoarji");
  revalidatePath("/zaloge");
  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const UpdateLotNameInput = z.object({
  lotId: z.string().min(1),
  name: z.string().min(1).max(120),
});

export async function updateLotName(input: z.infer<typeof UpdateLotNameInput>): Promise<ActionResult> {
  const parsed = UpdateLotNameInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavno ime." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("wine_lot")
    .select("name, vessel_id")
    .eq("id", parsed.data.lotId)
    .single();
  if (fetchError || !existing) return { ok: false, error: "Vino ne obstaja." };

  const { error } = await supabase
    .from("wine_lot")
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.lotId);
  if (error) return { ok: false, error: error.message };

  const createdBy = await currentStaffId(supabase);
  await supabase.from("wine_lot_event").insert({
    lot_id: parsed.data.lotId,
    event_type: "name_change",
    to_vessel_id: existing.vessel_id,
    note: `Ime: "${existing.name}" → "${parsed.data.name}"`,
    created_by: createdBy,
  });

  revalidatePath("/klet");
  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const UpdateLotStageInput = z.object({
  lotId: z.string().min(1),
  stage: z.enum(["grozdje", "vrenje", "vino"]),
});

const STAGE_LABEL: Record<string, string> = { grozdje: "Grozdje", vrenje: "Vrenje", vino: "Vino" };

export async function updateLotStage(input: z.infer<typeof UpdateLotStageInput>): Promise<ActionResult> {
  const parsed = UpdateLotStageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavna faza." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("wine_lot")
    .select("stage, vessel_id")
    .eq("id", parsed.data.lotId)
    .single();
  if (fetchError || !existing) return { ok: false, error: "Vino ne obstaja." };

  const { error } = await supabase
    .from("wine_lot")
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.lotId);
  if (error) return { ok: false, error: error.message };

  const createdBy = await currentStaffId(supabase);
  await supabase.from("wine_lot_event").insert({
    lot_id: parsed.data.lotId,
    event_type: "stage_change",
    to_vessel_id: existing.vessel_id,
    note: `Faza: ${STAGE_LABEL[existing.stage]} → ${STAGE_LABEL[parsed.data.stage]}`,
    created_by: createdBy,
  });

  revalidatePath("/klet");
  revalidatePath(`/klet/vino/${parsed.data.lotId}`);
  return { ok: true };
}

const CreateVesselInput = z.object({
  name: z.string().min(1).max(60),
  capacityL: z.number().positive(),
  category: z.enum(["cisterne", "inox", "sodi_225", "sodi_500"]),
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
  const { error } = await supabase.from("vessel").insert({
    name: parsed.data.name,
    capacity_l: parsed.data.capacityL,
    category: parsed.data.category,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet/rezervoarji");
  return { ok: true };
}

const UpdateVesselInput = z.object({
  vesselId: z.string().min(1),
  name: z.string().min(1).max(60),
  capacityL: z.number().positive(),
});

export async function updateVessel(input: z.infer<typeof UpdateVesselInput>): Promise<ActionResult> {
  const parsed = UpdateVesselInput.safeParse(input);
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
    .update({ name: parsed.data.name, capacity_l: parsed.data.capacityL, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.vesselId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/klet/rezervoarji");
  revalidatePath(`/klet/rezervoarji/${parsed.data.vesselId}`);
  return { ok: true };
}
