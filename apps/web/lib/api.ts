"use client";

// NEXT_PUBLIC_API_URL may be absolute (local development) or a same-origin path such as "/api",
// which the Next.js rewrite in next.config.ts forwards to the API (the recommended production setup).
const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const API_BASE_URL = configuredApiUrl.endsWith("/api") ? configuredApiUrl : `${configuredApiUrl}/api`;

/** An API failure that carries the HTTP status so callers can react to it (for example a 401). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    method,
    headers,
    credentials: "include",
    body: init.body
  });

  const responseText = await response.text();
  let payload: unknown = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login") && window.location.pathname !== "/login") {
    // The session has expired or been revoked: send the user to sign in instead of leaving an error on the page.
    window.location.assign("/login?expired=1");
  }

  const errorCode = typeof payload === "object" && payload && "code" in payload ? String((payload as { code?: unknown }).code) : undefined;
  if (response.status === 403 && errorCode === "MFA_SETUP_REQUIRED" && typeof window !== "undefined" && window.location.pathname !== "/account/security") {
    // The account must enrol in multi-factor authentication before it can use anything else.
    window.location.assign("/account/security");
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? String((payload as { error?: string }).error ?? "Request failed") : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, errorCode);
  }

  return (payload ?? undefined) as T;
}

export const API_URL = API_BASE_URL;
