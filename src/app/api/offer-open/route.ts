import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;
  if (!token || !/^[a-f0-9]{16,64}$/.test(token)) return NextResponse.json({ ok: false }, { status: 400 });
  await createAnonClient().rpc("offer_opened", { p_token: token });
  return NextResponse.json({ ok: true });
}
