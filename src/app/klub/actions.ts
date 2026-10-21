"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clubCardUrl, clubMailHtml, clubPublicUrl, clubUnsubscribeUrl, getClubSettings, MEMBER_COLUMNS, QR_PREFIX, SLIPPING_DAYS, toMember, type ClubMember } from "@/lib/club";
import { getCurrentStaff } from "@/lib/data";
import { sendMail } from "@/lib/documents/email";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Id = z.string().uuid();

function refresh() {
  revalidatePath("/klub", "layout");
}

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Prijava potrebna");
  return staff;
}

async function requireManager() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager") throw new Error("Samo za vodstvo");
  return staff;
}

// ------------------------------------------------------------------ stamping

/** A scanned QR ("COLNAR:CW-XXXXXX"), a typed card code, or a name / e-mail / phone. */
export async function findMembers(query: string): Promise<ClubMember[]> {
  await requireStaff();
  let q = query.trim();
  if (q.toUpperCase().startsWith(QR_PREFIX)) q = q.slice(QR_PREFIX.length);
  if (q.length < 2) return [];
  const supabase = await createClient();

  const code = q.toUpperCase().replace(/\s/g, "");
  const asCode = /^(CW-?)?[A-Z0-9]{6}$/.test(code) ? (code.startsWith("CW") ? code.replace(/^CW-?/, "CW-") : `CW-${code}`) : null;
  if (asCode) {
    const { data } = await supabase.from("club_member").select(MEMBER_COLUMNS).eq("card_code", asCode).limit(1);
    if (data && data.length > 0) return data.map(toMember);
  }

  const like = `%${q.replace(/[%_,()]/g, " ")}%`;
  const { data } = await supabase
    .from("club_member")
    .select(MEMBER_COLUMNS)
    .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .order("last_visit_at", { ascending: false, nullsFirst: false })
    .limit(8);
  return (data ?? []).map(toMember);
}

export async function getMember(id: string): Promise<ClubMember | null> {
  await requireStaff();
  if (!Id.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("club_member").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  return data ? toMember(data) : null;
}

async function rpc(name: "club_add_stamp" | "club_redeem" | "club_undo", args: Record<string, string>): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string };
  refresh();
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Ni uspelo" };
}

export async function addStamp(memberId: string): Promise<ActionResult> {
  if (!Id.safeParse(memberId).success) return { ok: false, error: "Napačen član" };
  return rpc("club_add_stamp", { p_member: memberId });
}

export async function redeemReward(memberId: string): Promise<ActionResult> {
  if (!Id.safeParse(memberId).success) return { ok: false, error: "Napačen član" };
  return rpc("club_redeem", { p_member: memberId });
}

export async function undoVisit(visitId: string): Promise<ActionResult> {
  if (!Id.safeParse(visitId).success) return { ok: false, error: "Napačen vnos" };
  return rpc("club_undo", { p_visit: visitId });
}

// ------------------------------------------------------------------ managers

const Settings = z.object({
  stampsNeeded: z.coerce.number().int().min(3).max(30),
  reward: z.string().trim().min(2).max(80),
  clubName: z.string().trim().min(2).max(60),
});

export async function saveClubSettings(input: z.input<typeof Settings>): Promise<ActionResult> {
  await requireManager();
  const p = Settings.safeParse(input);
  if (!p.success) return { ok: false, error: "Preverite vnos." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("club_settings")
    .update({ stamps_needed: p.data.stampsNeeded, reward: p.data.reward, club_name: p.data.clubName, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function saveMemberNote(id: string, note: string): Promise<ActionResult> {
  await requireManager();
  if (!Id.safeParse(id).success) return { ok: false, error: "Napačen član" };
  const supabase = await createClient();
  const { error } = await supabase.from("club_member").update({ note: note.trim().slice(0, 500) || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** GDPR erasure on request: the card and its visits are gone for good. */
export async function deleteMember(id: string): Promise<ActionResult> {
  await requireManager();
  if (!Id.safeParse(id).success) return { ok: false, error: "Napačen član" };
  const supabase = await createClient();
  const { error } = await supabase.from("club_member").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------ e-mails

export type Audience = "all" | "inactive" | "reward";

const Campaign = z.object({
  subject: z.string().trim().min(3, "Dodajte zadevo.").max(150),
  body: z.string().trim().min(10, "Sporočilo je prekratko.").max(5000),
  audience: z.enum(["all", "inactive", "reward"]),
});

async function audienceMembers(audience: Audience): Promise<(ClubMember & { token: string })[]> {
  const supabase = await createClient();
  const settings = await getClubSettings();
  const { data } = await supabase
    .from("club_member")
    .select(`${MEMBER_COLUMNS},token`)
    .eq("marketing_consent", true)
    .is("unsubscribed_at", null)
    .limit(5000);
  const now = Date.now();
  return (data ?? [])
    .map((r) => ({ ...toMember(r), token: r.token as string }))
    .filter((m) =>
      audience === "all"
        ? true
        : audience === "reward"
          ? m.stamps >= settings.stampsNeeded
          : !m.lastVisitAt || now - new Date(m.lastVisitAt).getTime() > SLIPPING_DAYS * 86400_000,
    );
}

export async function countAudience(audience: Audience): Promise<number> {
  await requireManager();
  return (await audienceMembers(audience)).length;
}

function personalise(text: string, m: { name: string }) {
  return text.replaceAll("{ime}", m.name.split(" ")[0]);
}

export async function sendCampaign(
  input: z.input<typeof Campaign> & { test?: boolean },
): Promise<{ ok: true; sent: number; failed: number; note?: string } | { ok: false; error: string }> {
  const staff = await requireManager();
  const p = Campaign.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Preverite vnos." };
  const { subject, body, audience } = p.data;
  const settings = await getClubSettings();
  const supabase = await createClient();

  const mailOne = (to: string, m: { name: string; token?: string }) =>
    sendMail({
      to,
      internal: true,
      subject: personalise(subject, m),
      text:
        personalise(body, m) +
        (m.token ? `\n\nVaša kartica: ${clubCardUrl(m.token)}\nOdjava od novic: ${clubUnsubscribeUrl(m.token)}` : ""),
      html: clubMailHtml({
        clubName: settings.clubName,
        body: personalise(body, m),
        buttonUrl: m.token ? clubCardUrl(m.token) : `${clubPublicUrl()}/`,
        buttonLabel: "Moja kartica zvestobe",
        unsubscribeUrl: m.token ? clubUnsubscribeUrl(m.token) : `${clubPublicUrl()}/`,
      }),
    });

  // Test copy to the person sending it.
  if (input.test) {
    const { data: me } = await supabase.from("staff").select("email").eq("id", staff.id).maybeSingle();
    const to = me?.email && !me.email.endsWith(".invalid") ? me.email : null;
    if (!to) return { ok: false, error: "Za vaš uporabniški račun ni e-naslova." };
    const r = await mailOne(to, { name: staff.fullName });
    return r.ok ? { ok: true, sent: 1, failed: 0, note: `Testno poslano na ${to}` } : { ok: false, error: r.error };
  }

  const members = await audienceMembers(audience);
  if (members.length === 0) return { ok: false, error: "Ni prejemnikov s soglasjem za novice." };

  // Safe test mode for the whole app: one copy to MAIL_ONLY_TO instead of everyone.
  const onlyTo = process.env.MAIL_ONLY_TO?.trim();
  if (onlyTo) {
    const r = await mailOne(onlyTo, members[0]);
    return r.ok
      ? { ok: true, sent: 1, failed: 0, note: `Testni način (MAIL_ONLY_TO): poslan en izvod na ${onlyTo} namesto ${members.length} članom.` }
      : { ok: false, error: r.error };
  }

  let sent = 0;
  let failed = 0;
  for (const m of members) {
    const r = await mailOne(m.email, m);
    if (r.ok) sent++;
    else failed++;
  }
  await supabase.from("club_campaign").insert({ subject, body, audience, recipients: members.length, sent, failed, sent_by: staff.id });
  refresh();
  return { ok: true, sent, failed };
}
