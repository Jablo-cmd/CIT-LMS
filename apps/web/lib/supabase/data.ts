"use client";

import { createClient } from "./client";
import type { LeaveCategory, UserRole } from "./database.types";

export async function getSessionProfile() {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error || !data) return null;
  const profile = data as { id: string; email: string; full_name: string; role: UserRole; is_active: boolean };
  if (!profile.is_active) return null;
  return { user, profile };
}

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (data.user) {
    await supabase.from("profiles").update({ last_login_at: new Date().toISOString() } as never).eq("id", data.user.id);
  }
  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function listEmployees() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, first_name, last_name, employment_status, employment_type, current_position, original_hire_date")
    .order("last_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function captureLeave(input: {
  employeeId: string; category: LeaveCategory; first: string; last: string;
  referenceNumber: string; paperFormDate: string; policyId: string; notes?: string; allowNegative?: boolean;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("capture_leave_deduction" as never, {
    p_employee_id: input.employeeId,
    p_category: input.category,
    p_first: input.first,
    p_last: input.last,
    p_reference_number: input.referenceNumber,
    p_paper_form_date: input.paperFormDate,
    p_policy_id: input.policyId,
    p_notes: input.notes ?? null,
    p_allow_negative: input.allowNegative ?? false
  } as never);
  if (error) throw new Error(error.message);
  return data;
}

export function roleCanManageUsers(role: UserRole) { return role === "COMPANY_OWNER"; }
export function roleIsHr(role: UserRole) { return role === "COMPANY_OWNER" || role === "HR_MANAGER"; }
export function roleCanSeeIdentityDocs(role: UserRole) { return role === "COMPANY_OWNER" || role === "HR_MANAGER"; }
