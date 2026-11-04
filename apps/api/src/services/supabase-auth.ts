import { config } from "../config.js";

type SupabaseUser = { id: string; email?: string; [key: string]: unknown };
type AuthSession = { access_token: string; refresh_token: string; expires_in: number; user: SupabaseUser };

function authHeaders(accessToken?: string) {
  if (!config.SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is not configured");
  return {
    apikey: config.SUPABASE_ANON_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

function adminHeaders() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { msg?: string; message?: string; error_description?: string };
  if (!response.ok) {
    const message = payload.error_description ?? payload.msg ?? payload.message ?? "Supabase Auth request failed";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return payload;
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000)
  });
  return parseResponse<AuthSession>(response);
}

export async function getSupabaseUser(accessToken: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(10_000)
  });
  return parseResponse<SupabaseUser>(response);
}

export async function refreshSupabaseSession(refreshToken: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000)
  });
  return parseResponse<AuthSession>(response);
}

export async function signOutSupabase(accessToken: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: authHeaders(accessToken),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok && response.status !== 401) await parseResponse(response);
}

export async function createSupabaseUser(email: string, password: string, fullName: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
    signal: AbortSignal.timeout(10_000)
  });
  return parseResponse<SupabaseUser>(response);
}

export async function updateSupabaseUserPassword(userId: string, password: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(10_000)
  });
  return parseResponse<SupabaseUser>(response);
}

export async function deleteSupabaseUser(userId: string) {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: adminHeaders().apikey, Authorization: adminHeaders().Authorization },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok && response.status !== 404) await parseResponse(response);
}

export function setAuthCookies(res: import("express").Response, session: Pick<AuthSession, "access_token" | "refresh_token" | "expires_in">) {
  const secure = config.NODE_ENV === "production" || config.COOKIE_SECURE === "true";
  const common = { httpOnly: true, secure, sameSite: secure ? "none" as const : "strict" as const, path: "/" };
  res.cookie("cit_access_token", session.access_token, { ...common, maxAge: Math.max(60, session.expires_in) * 1000 });
  res.cookie("cit_refresh_token", session.refresh_token, { ...common, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: import("express").Response) {
  const secure = config.NODE_ENV === "production" || config.COOKIE_SECURE === "true";
  const common = { httpOnly: true, secure, sameSite: secure ? "none" as const : "strict" as const, path: "/" };
  res.clearCookie("cit_access_token", common);
  res.clearCookie("cit_refresh_token", common);
}
