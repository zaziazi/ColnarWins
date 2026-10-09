import { NextResponse } from "next/server";
import { canUseDrustva } from "@/app/drustva/constants";
import { getCurrentStaff } from "@/lib/data";
import { buildWaveCsv, type ExportRow } from "@/lib/drustva/export";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** CSV of one wave for Instantly: not unsubscribed, not bounced, address not "probably wrong". */
export async function GET(req: Request) {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return NextResponse.json({ error: "Ni dostopa." }, { status: 403 });

  const wave = Number(new URL(req.url).searchParams.get("wave"));
  if (!Number.isInteger(wave) || wave < 0 || wave > 4) return NextResponse.json({ error: "Neveljaven val." }, { status: 400 });

  const supabase = await createClient();
  const rows: ExportRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("drustvo")
      .select("email,name,type,town,region,tier,distance_band,organizes_trips,wave,email_check,stage")
      .eq("wave", wave)
      .not("stage", "in", "(unsubscribed,bounced)")
      .order("name")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const d of data ?? []) {
      if (d.email_check === "probably_wrong") continue;
      rows.push(d as unknown as ExportRow);
    }
    if (!data || data.length < 1000) break;
  }

  return new NextResponse(buildWaveCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instantly-val-${wave}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
