export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    },
    cache: "no-store"
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}
