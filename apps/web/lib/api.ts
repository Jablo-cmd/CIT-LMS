"use client";

const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const API_BASE_URL = configuredApiUrl.endsWith("/api") ? configuredApiUrl : `${configuredApiUrl}/api`;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path.replace(/^\/+/, ""), `${API_BASE_URL}/`);
  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url.toString(), {
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

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? String((payload as { error?: string }).error ?? "Request failed") : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload ?? undefined) as T;
}

export const API_URL = API_BASE_URL;
