import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("API URL construction", () => {
  it("keeps the API prefix for leading-slash request paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://cit-lms-api.vercel.app/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");

    await api("/auth/login", { method: "POST" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cit-lms-api.vercel.app/api/auth/login");
  });

  it("adds the API prefix when the configured URL only has an origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://cit-lms-api.vercel.app/");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { api, API_URL } = await import("./api");

    await api("/employees?active=true");

    expect(API_URL).toBe("https://cit-lms-api.vercel.app/api");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cit-lms-api.vercel.app/api/employees?active=true");
  });
});