import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStorage() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("JWT_ACCESS_SECRET", "test-only-secret-that-is-long-enough");
  vi.stubEnv("STORAGE_DRIVER", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://cit-lms-test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "cit-lms-private");
  return import("./document-storage.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Supabase private document storage REST adapter", () => {
  it("uploads a private object with server-side credentials and no upsert", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await loadStorage();

    await storage.saveObject("employee-1/doc one.pdf", Buffer.from("%PDF"), "application/pdf");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://cit-lms-test.supabase.co/storage/v1/object/cit-lms-private/employee-1/doc%20one.pdf");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("x-upsert")).toBe("false");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-service-role-key");
  });

  it("removes an object through the bucket-level prefixes endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await loadStorage();

    await storage.removeObject("employee-1/private.pdf");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://cit-lms-test.supabase.co/storage/v1/object/cit-lms-private");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ prefixes: ["employee-1/private.pdf"] });
  });

  it("creates a short-lived URL internally and fetches the private object", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedURL: "/object/sign/cit-lms-private/employee-1/private.pdf?token=short" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("private bytes", { status: 200, headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await loadStorage();

    const result = await storage.getObject("employee-1/private.pdf");

    const [signUrl, signInit] = fetchMock.mock.calls[0]!;
    expect(signUrl).toBe("https://cit-lms-test.supabase.co/storage/v1/object/sign/cit-lms-private/employee-1/private.pdf");
    expect(JSON.parse(String(signInit?.body))).toEqual({ expiresIn: 60 });
    expect(fetchMock.mock.calls[1]![0]).toBe("https://cit-lms-test.supabase.co/storage/v1/object/sign/cit-lms-private/employee-1/private.pdf?token=short");
    expect(result.body.toString()).toBe("private bytes");
    expect(result.contentType).toBe("application/pdf");
  });

  it("creates a short-lived download URL with a safe attachment name", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ signedURL: "/object/sign/cit-lms-private/employee-1/private.pdf?token=short&download=private.pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await loadStorage();

    const signedUrl = await storage.createSignedDownloadUrl("employee-1/private.pdf", "private file.pdf");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://cit-lms-test.supabase.co/storage/v1/object/sign/cit-lms-private/employee-1/private.pdf?download=private+file.pdf");
    expect(JSON.parse(String(init?.body))).toEqual({ expiresIn: 60 });
    expect(signedUrl).toBe("https://cit-lms-test.supabase.co/storage/v1/object/sign/cit-lms-private/employee-1/private.pdf?token=short&download=private.pdf");
  });

  it("refuses a public bucket", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ public: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await loadStorage();

    await expect(storage.verifyPrivateBucket()).rejects.toThrow("must be private");
  });
});