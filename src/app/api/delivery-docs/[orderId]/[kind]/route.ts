import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Streams a stored dobavnica / račun PDF to a signed-in staff member.
 * The bucket is private; the admin client only runs after the caller's own
 * session proved they can read this order's outbox row (RLS decides).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string; kind: string }> },
) {
  const { orderId, kind } = await params;
  if (kind !== "dobavnica" && kind !== "racun") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("outbound_email")
    .select("dobavnica_path,racun_path")
    .eq("order_id", orderId)
    .maybeSingle();

  const path = kind === "dobavnica" ? row?.dobavnica_path : row?.racun_path;
  if (!path) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from("delivery-documents").download(path);
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${kind}-${orderId.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
