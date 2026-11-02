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
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (pErr || !profile) throw new Error("Authentication required");
  const p = profile as {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
  };
  if (!p.is_active) throw new Error("Account unavailable or session expired");
  return { supabase, user, profile: p };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const body =
    !isFormData && init.body && typeof init.body === "string"
      ? JSON.parse(init.body)
      : undefined;
  const formData = isFormData ? (init.body as FormData) : null;
  const { pathname, query } = parsePath(path);

  if (pathname === "/auth/me" && method === "GET") {
    const { profile } = await requireUser();
    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role
      }
    } as T;
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user!.id)
      .maybeSingle();
    const p = profile as {
      id: string;
      email: string;
      full_name: string;
      role: string;
    } | null;
    if (!p) throw new Error("Profile not provisioned. Contact the company owner.");
    await supabase
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() } as never)
      .eq("id", p.id);
    return {
      user: { id: p.id, email: p.email, fullName: p.full_name, role: p.role }
    } as T;
  }
  if (pathname === "/auth/change-password" && method === "POST") {
    const { supabase } = await requireUser();
    const { error } = await supabase.auth.updateUser({
      password: String(body.newPassword ?? body.password)
    });
    if (error) throw new Error(error.message);
    return { ok: true } as T;
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
    if (search)
      q = q.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%`
      );
    const { data, error, count } = await q.order("last_name").range(from, to);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const m = mapKeys<Record<string, unknown>>(row);
      return { ...m, department: null, currentPosting: null };
    });
    return {
      items,
      pagination: { total: count ?? items.length, page, pageSize }
    } as T;
  }

  if (pathname === "/employees" && method === "POST") {
    const { data, error } = await supabase
      .from("employees")
      .insert({
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
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const empMatch = pathname.match(/^\/employees\/([^/]+)$/);
  if (empMatch && method === "GET") {
    const id = empMatch[1];
    const { data, error } = await supabase
      .from("employees")
      .select(
        "*, departments(name), posting_sites(name), working_schedules(name), next_of_kin(*), employment_history(*)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Employee not found");
    const mapped = mapKeys<Record<string, unknown>>(data);
    const docs = await supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", id)
      .order("created_at", { ascending: false });
    return {
      employee: {
        ...mapped,
        department: (mapped as { departments?: { name: string } }).departments ?? null,
        currentPosting: (mapped as { posting_sites?: { name: string } }).posting_sites ?? null,
        workingSchedule:
          (mapped as { working_schedules?: { name: string } }).working_schedules ?? null,
        nextOfKin: (mapped as { nextOfKin?: unknown[] }).nextOfKin ?? [],
        history: (mapped as { history?: unknown[]; employmentHistory?: unknown[] }).employmentHistory
          ?? (mapped as { employment_history?: unknown[] }).employment_history
          ?? []
      },
      documents: mapKeys(docs.data ?? [])
    } as T;
  }
  if (empMatch && method === "PATCH") {
    if (
      profile.role === "ADMIN_PERSONNEL" &&
      body.employmentStatus &&
      body.employmentStatus !== "ACTIVE"
    ) {
      throw new Error("This change requires HR Manager or Company Owner permissions");
    }
    const patch: Record<string, unknown> = {};
    const map: Record<string, string> = {
      firstName: "first_name",
      lastName: "last_name",
      phone: "phone",
      email: "email",
      nationality: "nationality",
      employmentType: "employment_type",
      employmentStatus: "employment_status",
      departmentId: "department_id",
      currentPosition: "current_position",
      currentPostingId: "current_posting_id",
      workingScheduleId: "working_schedule_id",
      contractStartDate: "contract_start_date",
      contractEndDate: "contract_end_date"
    };
    for (const [k, v] of Object.entries(body ?? {})) if (k in map) patch[map[k]] = v;
    const { data, error } = await supabase
      .from("employees")
      .update(patch as never)
      .eq("id", empMatch[1])
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const kinMatch = pathname.match(/^\/employees\/([^/]+)\/next-of-kin$/);
  if (kinMatch && method === "POST") {
    const { data, error } = await supabase
      .from("next_of_kin")
      .insert({
        employee_id: kinMatch[1],
        full_name: body.fullName,
        relationship: body.relationship,
        phone: body.phone,
        email: body.email ?? null,
        is_primary: !!body.isPrimary
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const histMatch = pathname.match(/^\/postings\/history\/([^/]+)$/);
  if (histMatch && method === "POST") {
    const employeeId = histMatch[1];
    const { data, error } = await supabase
      .from("employment_history")
      .insert({
        employee_id: employeeId,
        previous_position: body.previousPosition ?? null,
        new_position: body.newPosition ?? null,
        previous_deployed_role: body.previousDeployedRole ?? null,
        new_deployed_role: body.newDeployedRole ?? null,
        previous_posting_id: body.previousPostingId ?? null,
        new_posting_id: body.newPostingId ?? null,
        effective_date: body.effectiveDate,
        reason: body.reason,
        manager_name: body.managerName ?? null,
        supporting_document_id: body.supportingDocumentId ?? null,
        recorded_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const empPatch: Record<string, unknown> = {};
    if (body.newPosition) empPatch.current_position = body.newPosition;
    if (body.newDeployedRole) empPatch.deployed_role = body.newDeployedRole;
    if (body.newPostingId) empPatch.current_posting_id = body.newPostingId;
    if (Object.keys(empPatch).length) {
      await supabase.from("employees").update(empPatch as never).eq("id", employeeId);
    }
    return mapKeys(data) as T;
  }

  if (pathname === "/leave/policies" && method === "GET") {
    const { data, error } = await supabase.from("leave_policies").select("*").order("category");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/leave/policies" && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase
      .from("leave_policies")
      .insert({
        category: body.category,
        name: body.name,
        entitlement_days: body.entitlementDays ?? null,
        accrual_per_month: body.accrualPerMonth ?? null,
        employment_type: body.employmentType ?? null,
        effective_from: body.effectiveFrom,
        effective_to: body.effectiveTo ?? null,
        carry_over_limit: body.carryOverLimit ?? null,
        created_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/leave/transactions" && method === "GET") {
    const { data, error } = await supabase
      .from("leave_transactions")
      .select("*, employees(first_name, last_name, employee_number)")
      .order("captured_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/leave/transactions" && method === "POST") {
    const { data, error } = await supabase.rpc("capture_leave_deduction" as never, {
      p_employee_id: body.employeeId,
      p_category: body.category as LeaveCategory,
      p_first: body.firstLeaveDate,
      p_last: body.lastLeaveDate,
      p_reference_number: body.referenceNumber ?? "",
      p_paper_form_date: body.formSubmissionDate ?? body.firstLeaveDate,
      p_policy_id: body.policyId ?? null,
      p_notes: body.reason ?? null,
      p_allow_negative: false
    } as never);
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const reverseMatch = pathname.match(/^\/leave\/transactions\/([^/]+)\/reverse$/);
  if (reverseMatch && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const id = reverseMatch[1];
    const { data: original, error: oErr } = await supabase
      .from("leave_transactions")
      .select("*")
      .eq("id", id)
      .single();
    if (oErr || !original) throw new Error("Transaction not found");
    const orig = original as {
      employee_id: string;
      category: string;
      days: number;
      transaction_type: string;
    };
    if (orig.transaction_type !== "DEDUCTION") throw new Error("Only deductions can be reversed");
    const { data, error } = await supabase
      .from("leave_transactions")
      .insert({
        employee_id: orig.employee_id,
        category: orig.category,
        transaction_type: "REVERSAL",
        days: orig.days,
        notes: body.reason,
        reverses_id: id,
        captured_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from("leave_transactions")
      .update({ transaction_type: "VOID" } as never)
      .eq("id", id);
    return mapKeys(data) as T;
  }

  const balMatch = pathname.match(/^\/leave\/balances\/([^/]+)\/adjust$/);
  if (balMatch && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase
      .from("leave_transactions")
      .insert({
        employee_id: balMatch[1],
        category: body.category,
        transaction_type: "ADJUSTMENT",
        days: body.days,
        notes: body.reason,
        captured_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if ((pathname === "/postings" || pathname === "/postings/sites") && method === "GET") {
    const { data, error } = await supabase.from("posting_sites").select("*").order("name");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if ((pathname === "/postings" || pathname === "/postings/sites") && method === "POST") {
    const { data, error } = await supabase
      .from("posting_sites")
      .insert({
        name: body.name,
        code: body.code,
        address: body.address ?? null,
        is_active: body.isActive !== false
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/calendar/holidays" || pathname === "/holidays") {
    if (method === "GET") {
      const { data, error } = await supabase.from("public_holidays").select("*").order("date");
      if (error) throw new Error(error.message);
      return { items: mapKeys(data ?? []) } as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase
        .from("public_holidays")
        .insert({
          name: body.name,
          date: body.date,
          is_recurring: !!body.isRecurring
        } as never)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapKeys(data) as T;
    }
  }
  if (pathname === "/calendar/schedules" || pathname === "/schedules") {
    if (method === "GET") {
      const { data, error } = await supabase.from("working_schedules").select("*").order("name");
      if (error) throw new Error(error.message);
      return { items: mapKeys(data ?? []) } as T;
    }
    if (method === "POST") {
      const { data, error } = await supabase
        .from("working_schedules")
        .insert({
          name: body.name,
          working_days: body.workingDays ?? body.days ?? [],
          hours_per_day: body.hoursPerDay ?? 8
        } as never)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapKeys(data) as T;
    }
  }
  if (pathname === "/departments") {
    const { data, error } = await supabase.from("departments").select("*").order("name");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }

  if (pathname === "/overtime" && method === "GET") {
    const { data, error } = await supabase
      .from("overtime_entries")
      .select("*")
      .order("work_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/overtime" && method === "POST") {
    const { data, error } = await supabase
      .from("overtime_entries")
      .insert({
        employee_id: body.employeeId,
        posting_site_id: body.postingSiteId ?? null,
        work_date: body.workDate,
        start_time: body.startTime,
        finish_time: body.finishTime,
        total_hours: body.totalHours,
        confirmed_by: body.confirmedBy,
        notes: body.notes ?? null,
        captured_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/disciplinary" && method === "GET") {
    const { data, error } = await supabase
      .from("disciplinary_records")
      .select("*")
      .order("hearing_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/disciplinary" && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase
      .from("disciplinary_records")
      .insert({
        employee_id: body.employeeId,
        hearing_date: body.hearingDate,
        outcome: body.outcome,
        notes: body.notes ?? null,
        recorded_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/recommendations" && method === "GET") {
    const { data, error } = await supabase
      .from("recommendations")
      .select("*")
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/recommendations" && method === "POST") {
    if (profile.role === "ADMIN_PERSONNEL") throw new Error("Insufficient permissions");
    const { data, error } = await supabase
      .from("recommendations")
      .insert({
        employee_id: body.employeeId,
        date: body.date,
        summary: body.summary,
        recorded_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/documents" && method === "GET") {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*, employees(first_name, last_name, employee_number), profiles:uploaded_by_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }

  const docEmpMatch = pathname.match(/^\/documents\/([^/]+)$/);
  if (docEmpMatch && method === "POST" && formData) {
    const employeeId = docEmpMatch[1];
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("File is required");
    const title = String(formData.get("title") ?? file.name);
    const category = String(formData.get("category") ?? "OTHER");
    const description = String(formData.get("description") ?? "");
    const storagePath = `${employeeId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data, error } = await supabase
      .from("employee_documents")
      .insert({
        employee_id: employeeId,
        title,
        category,
        description: description || null,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by_id: profile.id
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  const docDlMatch = pathname.match(/^\/documents\/([^/]+)\/download$/);
  if (docDlMatch && method === "GET") {
    const { data: row, error } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("id", docDlMatch[1])
      .single();
    if (error || !row) throw new Error("Document not found");
    const r = row as { storage_path: string; original_name: string; title: string; mime_type: string };
    const { data: signed, error: sErr } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(r.storage_path, 60);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Could not sign URL");
    return { url: signed.signedUrl, fileName: r.original_name || r.title, mimeType: r.mime_type } as T;
  }

  const photoMatch = pathname.match(/^\/documents\/photos\/([^/]+)$/);
  if (photoMatch && method === "POST" && formData) {
    const employeeId = photoMatch[1];
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("File is required");
    const storagePath = `${employeeId}/photo-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (upErr) throw new Error(upErr.message);
    await supabase
      .from("employees")
      .update({
        photo_path: storagePath,
        photo_updated_at: new Date().toISOString()
      } as never)
      .eq("id", employeeId);
    return { ok: true, path: storagePath } as T;
  }
  if (photoMatch && method === "GET") {
    const { data: emp, error } = await supabase
      .from("employees")
      .select("photo_path")
      .eq("id", photoMatch[1])
      .maybeSingle();
    if (error) throw new Error(error.message);
    const path = (emp as { photo_path?: string } | null)?.photo_path;
    if (!path) throw new Error("No photograph on file");
    const { data: signed, error: sErr } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(path, 120);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Could not sign URL");
    return { url: signed.signedUrl } as T;
  }

  if (pathname === "/users" && method === "GET") {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, last_login_at, created_at");
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname === "/users" && method === "POST") {
    if (profile.role !== "COMPANY_OWNER") throw new Error("Only the company owner can create users");
    const email = String(body.email).toLowerCase();
    const password = String(body.password);
    const fullName = String(body.fullName);
    const role = body.role as UserRole;
    const { data: signData, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (signErr) throw new Error(signErr.message);
    const newId = signData.user?.id;
    if (!newId) throw new Error("User creation did not return an id");
    const { error: profErr } = await supabase.from("profiles").upsert({
      id: newId,
      email,
      full_name: fullName,
      role,
      is_active: true
    } as never);
    if (profErr) throw new Error(profErr.message);
    return { id: newId, email, fullName, role } as T;
  }

  const userMatch = pathname.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    if (profile.role !== "COMPANY_OWNER") throw new Error("Only the company owner can update users");
    const patch: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
    if (body.role) patch.role = body.role;
    if (body.fullName) patch.full_name = body.fullName;
    const { data, error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", userMatch[1])
      .select("id, email, full_name, role, is_active")
      .single();
    if (error) throw new Error(error.message);
    return mapKeys(data) as T;
  }

  if (pathname === "/audit" && method === "GET") {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: mapKeys(data ?? []) } as T;
  }
  if (pathname.startsWith("/reports")) {
    const { count: empCount } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true });
    const { count: leaveCount } = await supabase
      .from("leave_transactions")
      .select("*", { count: "exact", head: true });
    return { employees: empCount ?? 0, leaveTransactions: leaveCount ?? 0 } as T;
  }

  throw new Error(`API route not migrated to Supabase yet: ${method} ${pathname}`);
}

/** Helper: get a short-lived signed download URL for a document. */
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<{ url: string; fileName: string; mimeType?: string }> {
  return api(`/documents/${documentId}/download`);
}

/** Helper: get a short-lived signed URL for an employee photo, or null. */
export async function getEmployeePhotoUrl(employeeId: string): Promise<string | null> {
  try {
    const res = await api<{ url: string }>(`/documents/photos/${employeeId}`);
    return res.url;
  } catch {
    return null;
  }
}

/** @deprecated Kept for import compatibility. Do not build fetch URLs with this. */
export const API_URL = "";
