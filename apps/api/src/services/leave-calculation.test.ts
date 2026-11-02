import { describe, expect, it } from "vitest";
import { countWorkingDays, dateOnlyUtc } from "./leave-calculation.js";

describe("countWorkingDays", () => {
  it("counts weekdays inclusively", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(5);
  });

  it("excludes configured public holidays", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1, 2, 3, 4, 5], ["2026-06-03"])).toBe(4);
  });

  it("supports employees rostered on weekends", () => {
    expect(countWorkingDays(new Date("2026-06-05T00:00:00Z"), new Date("2026-06-08T00:00:00Z"), [0, 6])).toBe(2);
  });

  it("returns zero when range has no working days", () => {
    expect(countWorkingDays(new Date("2026-06-06T00:00:00Z"), new Date("2026-06-07T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(0);
  });

  it("handles single-day leave on a working day", () => {
    expect(countWorkingDays(new Date("2026-06-03T00:00:00Z"), new Date("2026-06-03T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(1);
  });

  it("handles single-day leave on a holiday", () => {
    expect(countWorkingDays(new Date("2026-06-03T00:00:00Z"), new Date("2026-06-03T00:00:00Z"), [1, 2, 3, 4, 5], ["2026-06-03"])).toBe(0);
  });

  it("spans month and year boundaries", () => {
    expect(countWorkingDays(new Date("2025-12-30T00:00:00Z"), new Date("2026-01-02T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(4);
  });

  it("rejects inverted date ranges", () => {
    expect(() => countWorkingDays(new Date("2026-06-05T00:00:00Z"), new Date("2026-06-01T00:00:00Z"), [1, 2, 3, 4, 5])).toThrow(/on or after/i);
  });
});

describe("dateOnlyUtc", () => {
  it("strips time components to UTC midnight", () => {
    const d = dateOnlyUtc(new Date("2026-06-15T15:30:00Z"));
    expect(d.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});
