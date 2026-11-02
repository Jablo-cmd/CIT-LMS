import { describe, expect, it } from "vitest";
import { countWorkingDays, dateOnlyUtc } from "./leave-calculation";

describe("countWorkingDays (Supabase parity)", () => {
  it("counts weekdays inclusively", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(5);
  });
  it("excludes public holidays", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1, 2, 3, 4, 5], ["2026-06-03"])).toBe(4);
  });
  it("supports weekend schedules", () => {
    expect(countWorkingDays(new Date("2026-06-05T00:00:00Z"), new Date("2026-06-08T00:00:00Z"), [0, 6])).toBe(2);
  });
  it("spans year boundary", () => {
    expect(countWorkingDays(new Date("2025-12-30T00:00:00Z"), new Date("2026-01-02T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(4);
  });
  it("rejects inverted range", () => {
    expect(() => countWorkingDays(new Date("2026-06-05T00:00:00Z"), new Date("2026-06-01T00:00:00Z"), [1, 2, 3, 4, 5])).toThrow(/on or after/i);
  });
});

describe("dateOnlyUtc", () => {
  it("strips time to UTC midnight", () => {
    expect(dateOnlyUtc(new Date("2026-06-15T15:30:00Z")).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});
