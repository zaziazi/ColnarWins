import "server-only";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export interface StaffMember {
  id: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
  phone: string | null;
  email: string | null;
  hasLogin: boolean;
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").select("id,full_name,role,active,phone,email,auth_user_id").order("full_name");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    fullName: s.full_name as string,
    role: s.role as StaffRole,
    active: s.active !== false,
    phone: (s.phone as string | null) ?? null,
    email: (s.email as string | null) ?? null,
    hasLogin: Boolean(s.auth_user_id),
  }));
}
