"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordResult = { ok: false; error: string };

const Input = z
  .object({
    password: z.string().min(8, "Geslo naj ima vsaj 8 znakov.").max(72, "Geslo je predolgo."),
    repeat: z.string(),
  })
  .refine((d) => d.password === d.repeat, { message: "Gesli se ne ujemata.", path: ["repeat"] });

/** Replaces the password and clears the "must change" flag, then lands the user in the app. */
export async function changePassword(input: { password: string; repeat: string }): Promise<PasswordResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Seja je potekla. Prijavi se znova." };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { must_change_password: false },
  });
  if (error) {
    const same = /different from the old password|same/i.test(error.message);
    return { ok: false, error: same ? "Novo geslo mora biti drugačno od starega." : "Gesla ni bilo mogoče spremeniti." };
  }
  redirect("/pregled");
}
