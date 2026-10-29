import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type FixKind = "problem" | "idea";
export type FixStatus = "new" | "done";

export interface FixRequest {
  id: string;
  createdAt: string;
  staffName: string;
  staffRole: string | null;
  kind: FixKind;
  message: string;
  pagePath: string | null;
  pageTitle: string | null;
  device: string | null;
  status: FixStatus;
}

export const KIND_LABEL: Record<FixKind, string> = { problem: "Napaka", idea: "Predlog" };

interface Row {
  id: string;
  created_at: string;
  staff_name: string;
  staff_role: string | null;
  kind: FixKind;
  message: string;
  page_path: string | null;
  page_title: string | null;
  device: string | null;
  status: FixStatus;
}

/** Newest first. RLS lets only the admin read everyone's. */
export async function getFixes(db: Db, status: FixStatus | "all"): Promise<FixRequest[]> {
  let q = db.from("fix_request").select("id,created_at,staff_name,staff_role,kind,message,page_path,page_title,device,status").order("created_at", { ascending: false }).limit(1000);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    staffName: r.staff_name,
    staffRole: r.staff_role,
    kind: r.kind,
    message: r.message,
    pagePath: r.page_path,
    pageTitle: r.page_title,
    device: r.device,
    status: r.status,
  }));
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** A plain text file meant to be pasted to Claude Code: one block per request, oldest first. */
export function fixesToMarkdown(rows: FixRequest[], label: string): string {
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const head = [
    "# Colnix: FIX requests from the team",
    "",
    `Exported ${when(new Date().toISOString())} · ${label} · ${ordered.length} request${ordered.length === 1 ? "" : "s"}`,
    "",
    "Each block is something a team member reported from inside the app (\"Napaka\" = something is wrong, \"Predlog\" = something they want).",
    "Please go through them one by one: say what you understood, group duplicates, then propose the fix before changing anything.",
    "",
  ];
  const blocks = ordered.map((r, i) =>
    [
      `## ${i + 1}. ${KIND_LABEL[r.kind]} · ${r.staffName}${r.staffRole ? ` (${r.staffRole})` : ""} · ${when(r.createdAt)}`,
      `- Screen: ${r.pagePath ?? "?"}${r.pageTitle ? ` (${r.pageTitle})` : ""}`,
      r.device ? `- Device: ${r.device}` : null,
      `- Id: ${r.id}`,
      "",
      r.message
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
      "",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
  return [...head, ...blocks].join("\n");
}
