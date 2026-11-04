import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { protectCookieMutations } from "./csrf.js";

function invoke(method: string, headers: Record<string, string>) {
  const req = { method, get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  protectCookieMutations(req, res, next);
  return { res, next };
}

describe("cookie mutation CSRF protection", () => {
  it("allows a cross-site request only when its Origin is the configured web origin", () => {
    const { next, res } = invoke("POST", {
      "sec-fetch-site": "cross-site",
      origin: "http://localhost:3000"
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests with an untrusted Origin", () => {
    const { next, res } = invoke("POST", {
      "sec-fetch-site": "cross-site",
      origin: "https://attacker.example"
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects unsafe requests without Origin or Referer", () => {
    const { next, res } = invoke("POST", {});
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows safe methods without an Origin header", () => {
    const { next, res } = invoke("GET", {});
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
