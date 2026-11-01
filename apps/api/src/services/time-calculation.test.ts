import { describe, expect, it } from "vitest";
import { calculateElapsedHours } from "./time-calculation.js";

describe("calculateElapsedHours", () => {
  it("calculates a normal same-day shift", () => expect(calculateElapsedHours("09:00","17:30")).toBe(8.5));
  it("calculates an overnight shift", () => expect(calculateElapsedHours("22:00","02:00")).toBe(4));
  it("treats equal times as a full 24-hour span", () => expect(calculateElapsedHours("08:00","08:00")).toBe(24));
  it("rejects malformed times", () => expect(() => calculateElapsedHours("25:00","10:00")).toThrow("HH:MM"));
});
