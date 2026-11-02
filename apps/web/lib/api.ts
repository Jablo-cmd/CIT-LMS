/**
 * Compatibility API layer: maps legacy Express paths to Supabase.
 * Uses the browser Supabase client (RLS enforced). Never embeds the secret key.
 */
"use client";

import { createClient } from "./supabase/client";
import type { LeaveCategory, UserRole } from "./supabase/database.types";

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function mapKeys<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamelKey(k)] = mapKeys(v);
    }
    return out as T;
  }
  return value as T;
}

function parsePath(path: string): { pathname: string; query: URLSearchParams } {
  const [pathname, qs] = path.split("?");
  return { pathname, query: new URLSearchParams(qs ?? "") };
}

async function requireUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (pErr || !profile) throw new Error("Authentication required");
  const p = profile as { id: string; email: string; full_name: string; role: UserRole; is_active: boolean };
  if (!p.is_active) throw new Error("Account unavailable or session expired");
  return { supabase, user, profile: p };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  const { pathname, query } = parsePath(path);

  if (pathname === "/auth/me" && method === "GET") {
    const { profile } = await requireUser();
    return { user: { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role } } as T;
  }
  if (pathname === "/auth/logout" && method === "POST") {
    const supabase = createClient();
    await supabase.auth.signOut();
    return undefined as T;
  }
  if (pathname === "/auth/login" && method === "POST") {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(body.email).toLowerCase(),
      password: String(body.password)
    });
    if (error) throw new Error(error.message);
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user!.id).maybeSingle();
    const p = profile as { id: string; email: string; full_name: string; role: string } | null;
    if (!p) throw new Error("Profile not provisioned. Contact the company owner.");
    await supabase.from("profiles").update({ last_login_at: new Date().toISOString() } as never).eq("id", p.id);
    return { user: { id: p.id, email: p.email, fullName: p.full_name, role: p.role } } as T;
  }

  const { supabase, profile } = await requireUser();

  if (pathname === "/employees" && method === "GET") {
    const page = Number(query.get("page") ?? "1");
    const pageSize = Number(query.get("pageSize") ?? "20");
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase.from("employees").select(
      "id, employee_number, first_name, last_name, employment_type, employment_status, current_position, department_id, current_posting_id, original_hire_date",
      { count: "exact" }
    );
    const status = query.get("status");
    if (status) q = q.eq("employment_status", status);
    const search = query.get("q") ?? query.get("search");
    if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%`);
    const { data, error, count } = await q.order("last_name").range(from, to);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const m = mapKeys<Record<string, unknown>>(row);
      return { ...m, department: null, currentPosting: null };
    });
    return { items, pagination: { total: count ?? items.length, page, pageSize } } as T;
  }

  if (pathname === "/employees" && method === "POST") {
    const { data, error } = await supabase.from("employees").insert({
      employee_number: body.employeeNumber,
      first_name: body.firstName,
      last_name: body.lastName,
      nationality: body.nationality ?? null,
      employment_type: body.employmentType,
      employment_status: body.employmentStatus ?? "ACTIVE",
      original_hire_date: body.originalHireDate,
      phone: body.phone ?? null,
      email: body.email ?? null,
      department_id: body.departmentId ?? null,
      current_position: body.currentPosition ?? null,
      current_posting_id: body.currentPostingId ?? null,
      working_schedule_id: body.workingScheduleId ?? null
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const empMatch = pathname.match(/^\/employees\/([^/]+)$/);
  if (empMatch && method === "GET") {
    const { data, error } = await supabase.from("employees").select("*").eq("id", empMatch[1]).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Employee not found");
    return mapKeys(data) as T;
  }
  if (empMatch && method === "PATCH") {
    if (profile.role === "ADMIN_PERSONNEL" && body.employmentStatus && body.employmentStatus !== "ACTIVE") {
      throw new Error("This change requires HR Manager or Company Owner permissions");
    }
    const patch: Record<string, unknown> = {};
    const map: Record<string, string> = {
      firstName: "first_name", lastName: "last_name", phone: "phone", email: "email",
      nationality: "nationality", employmentType: "employment_type", employmentStatus: "employment_status",
      departmentId: "department_id", currentPosition: "current_position",
      currentPostingId: "current_posting_id", workingScheduleId: "working_schedule_id",
      contractStartDate: "contract_start_date", contractEndDate: "contract_end_date"
    };
    for (const [k, v] of Object.entries(body ?? {})) if (k in map) patch[map[k]] = v;
    const { data, error } = await supabase.from("employees").update(patch as never).eq("id", empMatch[1]).select("*").single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/leave/policies" && method === "GET") {
    const { data, error } = await supabase.from("leave_policies").select("*").order("category");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/leave/policies" && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase.from("leave_policies").insert({
      category: body.category, name: body.name,
      entitlement_days: body.entitlementDays ?? null, accrual_per_month: body.accrualPerMonth ?? null,
      employment_type: body.employmentType ?? null, effective_from: body.effectiveFrom,
      effective_to: body.effectiveTo ?? null, carry_over_limit: body.carryOverLimit ?? null,
      created_by_id: profile.id
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/leave/transactions" && method === "GET") {
    const { data, error } = await supabase.from("leave_transactions").select("*, employees(first_name, last_name, employee_number)").order("captured_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/leave/transactions" && method === "POST") {
    const { data, error } = await supabase.rpc("capture_leave_deduction" as never, {
      p_employee_id: body.employeeId, p_category: body.category as LeaveCategory,
      p_first: body.firstLeaveDate, p_last: body.lastLeaveDate,
      p_reference_number: body.referenceNumber ?? "",
      p_paper_form_date: body.formSubmissionDate ?? body.firstLeaveDate,
      p_policy_id: body.policyId ?? null, p_notes: body.reason ?? null, p_allow_negative: false
    } as never);
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const reverseMatch = pathname.match(/^\/leave\/transactions\/([^/]+)\/reverse$/);
  if (reverseMatch && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const id = reverseMatch[1];
    const { data: original, error: oErr } = await supabase.from("leave_transactions").select("*").eq("id", id).single();
    if (oErr || !original) throw new Error("Transaction not found");
    const orig = original as { employee_id: string; category: string; days: number; transaction_type: string };
    if (orig.transaction_type !== "DEDUCTION") throw new Error("Only deductions can be reversed");
    const { data, error } = await supabase.from("leave_transactions").insert({
      employee_id: orig.employee_id, category: orig.category, transaction_type: "REVERSAL",
      days: orig.days, notes: body.reason, reverses_id: id, captured_by_id: profile.id
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    await supabase.from("leave_transactions").update({ transaction_type: "VOID" } as never).eq("id", id);
    return mapKeys(data) as T;
  }

  const balMatch = pathname.match(/^\/leave\/balances\/([^/]+)\/adjust$/);
  if (balMatch && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase.from("leave_transactions").insert({
      employee_id: balMatch[1], category: body.category, transaction_type: "ADJUSTMENT",
      days: body.days, notes: body.reason, captured_by_id: profile.id
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if ((pathname === "/postings" || pathname === "/postings/sites") && method === "GET") {
    const { data, error } = await supabase.from("posting_sites").select("*").order("name");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/calendar/holidays" || pathname === "/holidays") {
    const { data, error } = await supabase.from("public_holidays").select("*").order("date");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/calendar/schedules" || pathname === "/schedules") {
    const { data, error } = await supabase.from("working_schedules").select("*").order("name");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/departments") {
    const { data, error } = await supabase.from("departments").select("*").order("name");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/overtime" && method === "GET") {
    const { data, error } = await supabase.from("overtime_entries").select("*").order("work_date", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/overtime" && method === "POST") {
    const { data, error } = await supabase.from("overtime_entries").insert({
      employee_id: body.employeeId, posting_site_id: body.postingSiteId ?? null,
      work_date: body.workDate, start_time: body.startTime, finish_time: body.finishTime,
      total_hours: body.totalHours, confirmed_by: body.confirmedBy, notes: body.notes ?? null,
      captured_by_id: profile.id
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }
  if (pathname === "/disciplinary" && method === "GET") {
    const { data, error } = await supabase.from("disciplinary_records").select("*").order("hearing_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/recommendations" && method === "GET") {
    const { data, error } = await supabase.from("recommendations").select("*").order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/documents" && method === "GET") {
    const { data, error } = await supabase.from("employee_documents").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/users" && method === "GET") {
    const { data, error } = await supabase.from("profiles").select("id, email, full_name, role, is_active, last_login_at, created_at");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/audit" && method === "GET") {
    const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname.startsWith("/reports")) {
    const { count: empCount } = await supabase.from("employees").select("*", { count: "exact", head: true });
    const { count: leaveCount } = await supabase.from("leave_transactions").select("*", { count: "exact", head: true });
    return { employees: empCount ?? 0, leaveTransactions: leaveCount ?? 0 } as T;
  }

  throw new Error(`API route not migrated to Supabase yet: ${method} ${pathname}`);
}

export const API_URL = "supabase";
