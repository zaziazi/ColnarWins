import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { parseWebReservation } from "@/lib/degustacije/web-parse";
import { pushToDrustvaStaff } from "@/lib/drustva/notify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Reservation e-mails from the website form arrive here — from a small script
 * on the tastings mailbox (see scripts/degustacije-gmail-forwarder.gs) or any
 * mail-to-webhook service. Body: { message_id, from_email, from_name?,
 * subject?, text, received_at? }. Header x-colnix-secret must match
 * DEGUSTACIJE_INBOUND_SECRET. Stored once per message_id; the AI reading and
 * the push notification happen after the response.
 */
export async function POST(req: Request) {
  const secret = process.env.DEGUSTACIJE_INBOUND_SECRET;
  if (!secret) return NextResponse.json({ error: "DEGUSTACIJE_INBOUND_SECRET is not configured" }, { status: 503 });
  if (!sameSecret(req.headers.get("x-colnix-secret"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const payload = {
    message_id: typeof body.message_id === "string" ? body.message_id.slice(0, 300) : null,
    from_email: typeof body.from_email === "string" ? body.from_email.slice(0, 200) : null,
    from_name: typeof body.from_name === "string" ? body.from_name.slice(0, 200) : null,
    subject: typeof body.subject === "string" ? body.subject.slice(0, 300) : null,
    text: typeof body.text === "string" ? body.text.slice(0, 20000) : "",
    received_at: typeof body.received_at === "string" ? body.received_at : null,
  };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No database access" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("degustacije_ingest_web", { p_payload: payload });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // sender retries; ingest is idempotent
  const result = data as { status: string; id?: string };

  if (result.id) {
    after(async () => {
      let summary: string | null = null;
      try {
        await parseWebReservation(admin, result.id!);
        const { data: w } = await admin.from("web_reservation").select("summary,status,from_name,from_email,subject").eq("id", result.id!).single();
        summary = (w?.summary as string | null) ?? null;
        if (w?.status === "dismissed") return; // not a reservation (spam, newsletter): no ping
        await pushToDrustvaStaff(admin, {
          title: `Degustacije · nova spletna rezervacija · ${(w?.from_name as string | null) ?? (w?.from_email as string | null) ?? ""}`.trim(),
          body: clip(summary ?? ((w?.subject as string | null) ?? "Nova rezervacija"), 120),
          url: "/degustacije",
          tag: `web-reservation-${result.id}`,
        });
      } catch (e) {
        console.error("web reservation processing failed", e);
      }
    });
  }
  return NextResponse.json(result);
}
