import "server-only";
import QRCode from "qrcode";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

/**
 * Klub zvestobe (Vinoteka loyalty club).
 *
 * A guest joins on colnar.si/klub (QR on the counter), gets a web card at
 * colnar.si/klub/k/<token>/ with their own QR, and saves it to the home screen.
 * Staff scan that QR in /klub: one stamp per visit (max one a day), and
 * `stamps_needed` stamps buy the reward. Managers see the overview and send
 * e-mails to members who ticked the marketing box.
 */

export interface ClubSettings {
  stampsNeeded: number;
  reward: string;
  clubName: string;
}

export interface ClubMember {
  id: string;
  cardCode: string;
  name: string;
  email: string;
  phone: string | null;
  marketing: boolean;
  stamps: number;
  visits: number;
  rewardsRedeemed: number;
  lastVisitAt: string | null;
  createdAt: string;
  note: string | null;
}

export interface ClubVisit {
  id: string;
  memberId: string;
  memberName: string;
  kind: "stamp" | "redeem";
  staffName: string | null;
  createdAt: string;
}

export interface ClubStats {
  members: number;
  newThisMonth: number;
  active60: number;
  visitsThisMonth: number;
  visitsLastMonth: number;
  returning: number;
  rewardsReady: number;
  rewardsRedeemed: number;
  marketing: number;
  /** Came at least twice, but not in the last 45 days. */
  slipping: ClubMember[];
  /** Visits per week, last 12 weeks, oldest first. */
  weekly: { week: string; visits: number }[];
}

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  stampsNeeded: 10,
  reward: "kozarec vina po izbiri",
  clubName: "Klub Vinoteke Colnar",
};

/** Days without a visit after which a regular counts as slipping away. */
export const SLIPPING_DAYS = 45;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toMember(r: any): ClubMember {
  return {
    id: r.id,
    cardCode: r.card_code,
    name: r.name,
    email: r.email,
    phone: r.phone,
    marketing: Boolean(r.marketing_consent) && !r.unsubscribed_at,
    stamps: r.stamps,
    visits: r.visits,
    rewardsRedeemed: r.rewards_redeemed,
    lastVisitAt: r.last_visit_at,
    createdAt: r.created_at,
    note: r.note,
  };
}

export const MEMBER_COLUMNS =
  "id,card_code,name,email,phone,marketing_consent,unsubscribed_at,stamps,visits,rewards_redeemed,last_visit_at,created_at,note";

export async function getClubSettings(): Promise<ClubSettings> {
  if (isDemoMode) return DEFAULT_CLUB_SETTINGS;
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("stamps_needed,reward,club_name").maybeSingle();
  if (!data) return DEFAULT_CLUB_SETTINGS;
  return { stampsNeeded: data.stamps_needed, reward: data.reward, clubName: data.club_name };
}

export async function getRecentVisits(limit = 12, staffId?: string): Promise<ClubVisit[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  let q = supabase
    .from("club_visit")
    .select("id,member_id,kind,created_at,staff_id,club_member(name),staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (staffId) q = q.eq("staff_id", staffId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memberName: (r.club_member as any)?.name ?? "—",
    kind: r.kind as "stamp" | "redeem",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    staffName: (r.staff as any)?.full_name ?? null,
    createdAt: r.created_at,
  }));
}

export async function getMembers(): Promise<ClubMember[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("club_member").select(MEMBER_COLUMNS).order("created_at", { ascending: false }).limit(2000);
  return (data ?? []).map(toMember);
}

function ljMonthStart(offset = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

export async function getClubStats(settings: ClubSettings): Promise<ClubStats> {
  const empty: ClubStats = {
    members: 0, newThisMonth: 0, active60: 0, visitsThisMonth: 0, visitsLastMonth: 0, returning: 0,
    rewardsReady: 0, rewardsRedeemed: 0, marketing: 0, slipping: [], weekly: [],
  };
  if (isDemoMode) return empty;
  const supabase = await createClient();
  const since = new Date(Date.now() - 84 * 86400_000);
  const [members, visits] = await Promise.all([getMembers(), supabase.from("club_visit").select("kind,created_at").gte("created_at", ljMonthStart(-1) < since ? ljMonthStart(-1).toISOString() : since.toISOString())]);

  const now = Date.now();
  const thisMonth = ljMonthStart(0).getTime();
  const lastMonth = ljMonthStart(-1).getTime();
  const stamps = (visits.data ?? []).filter((v) => v.kind === "stamp").map((v) => new Date(v.created_at).getTime());

  // week buckets (Monday start), last 12 weeks
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (11 - i) * 7);
    const end = start.getTime() + 7 * 86400_000;
    return {
      week: `${start.getDate()}. ${start.getMonth() + 1}.`,
      visits: stamps.filter((t) => t >= start.getTime() && t < end).length,
    };
  });

  return {
    members: members.length,
    newThisMonth: members.filter((m) => new Date(m.createdAt).getTime() >= thisMonth).length,
    active60: members.filter((m) => m.lastVisitAt && now - new Date(m.lastVisitAt).getTime() < 60 * 86400_000).length,
    visitsThisMonth: stamps.filter((t) => t >= thisMonth).length,
    visitsLastMonth: stamps.filter((t) => t >= lastMonth && t < thisMonth).length,
    returning: members.filter((m) => m.visits >= 2).length,
    rewardsReady: members.filter((m) => m.stamps >= settings.stampsNeeded).length,
    rewardsRedeemed: members.reduce((s, m) => s + m.rewardsRedeemed, 0),
    marketing: members.filter((m) => m.marketing).length,
    slipping: members
      .filter((m) => m.visits >= 2 && m.lastVisitAt && now - new Date(m.lastVisitAt).getTime() > SLIPPING_DAYS * 86400_000)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 20),
    weekly,
  };
}

/**
 * Guests never see Colnix: joining, the card and unsubscribing live on the
 * public website at colnar.si/klub (colnar-site, Netlify functions). Colnix
 * only builds links there — the counter poster QR and the club e-mails.
 */
export function clubPublicUrl(): string {
  return (process.env.CLUB_PUBLIC_URL?.trim() || "https://colnar.si/klub").replace(/\/$/, "");
}
export const clubCardUrl = (token: string) => `${clubPublicUrl()}/k/${token}/`;
export const clubUnsubscribeUrl = (token: string) => `${clubPublicUrl()}/odjava/${token}/`;

export async function qrSvg(text: string, color = "#231a1c"): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: color, light: "#ffffff" } });
}

/** What the guest's QR carries: "COLNAR:<card code>". Staff can also type the code. */
export const QR_PREFIX = "COLNAR:";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A plain branded e-mail: paragraphs, one button, and an unsubscribe line when it is marketing. */
export function clubMailHtml(opts: { clubName: string; body: string; buttonUrl: string; buttonLabel: string; unsubscribeUrl?: string }): string {
  const paras = escapeHtml(opts.body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f3ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#231a1c">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
<div style="font-weight:700;font-size:15px;margin-bottom:18px">${escapeHtml(opts.clubName)}<span style="color:#7a1230">.</span></div>
<div style="background:#fff;border:1px solid #e7ded9;border-radius:14px;padding:22px 20px;font-size:15px">${paras}
<a href="${opts.buttonUrl}" style="display:inline-block;margin-top:6px;background:#7a1230;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">${escapeHtml(opts.buttonLabel)}</a>
</div>
${opts.unsubscribeUrl ? `<p style="font-size:12px;color:#9c8e91;margin-top:16px;line-height:1.5">To sporočilo ste prejeli, ker ste se v klubu zvestobe prijavili na novice. <a href="${opts.unsubscribeUrl}" style="color:#9c8e91">Odjava od novic</a></p>` : ""}
</div></body></html>`;
}
