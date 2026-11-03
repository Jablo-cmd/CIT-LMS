"use client";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
export const API_URL = `${(configuredApiUrl || "http://localhost:4000").replace(/\/$/, "")}/api`;

function parsePath(path: string): string {
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (init.body !== undefined && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(parsePath(path), {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to reach the CIT-LMS API. Check the API URL and network connection.");
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
      throw new Error(payload.error);
    }
    throw new Error(typeof payload === "string" && payload ? payload : `Request failed (${response.status})`);
  }

  return payload as T;
}
