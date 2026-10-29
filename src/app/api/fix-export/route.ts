import { NextResponse, type NextRequest } from "next/server";
import { getRealStaff } from "@/lib/data";
import { fixesToMarkdown, getFixes, type FixStatus } from "@/lib/fix";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Admin only: downloads the FIX requests as a text file to paste to Claude Code. ?s=new|done|all (default new). */
export async function GET(req: NextRequest) {
  const me = await getRealStaff();
  if (!me?.isAdmin) return new NextResponse("Ni dostopa.", { status: 403 });

  const s = req.nextUrl.searchParams.get("s");
  const status: FixStatus | "all" = s === "all" ? "all" : s === "done" ? "done" : "new";
  const rows = await getFixes(await createClient(), status);
  const label = status === "all" ? "all requests" : status === "done" ? "done requests" : "new requests";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());

  return new NextResponse(fixesToMarkdown(rows, label), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="colnix-fix-${status}-${day}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
