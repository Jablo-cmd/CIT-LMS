import { describe, expect, it } from "vitest";
import { countWorkingDays } from "./leave-calculation.js";

describe("countWorkingDays", () => {
  it("counts weekdays inclusively", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1,2,3,4,5])).toBe(5);
  });
  it("excludes configured public holidays", () => {
    expect(countWorkingDays(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), [1,2,3,4,5], ["2026-06-03"])).toBe(4);
  });
  it("supports employees rostered on weekends", () => {
    expect(countWorkingDays(new Date("2026-06-05T00:00:00Z"), new Date("2026-06-08T00:00:00Z"), [0,6])).toBe(2);
  });
  it("returns one for a single scheduled workday", () => {
    expect(countWorkingDays(new Date("2026-06-02T00:00:00Z"), new Date("2026-06-02T00:00:00Z"), [2])).toBe(1);
  });
  it("rejects a reversed date range", () => {
    expect(() => countWorkingDays(new Date("2026-06-06T00:00:00Z"), new Date("2026-06-01T00:00:00Z"), [1,2,3,4,5])).toThrow("Last leave date");
  });
  it("rejects invalid dates", () => {
    expect(() => countWorkingDays(new Date("invalid"), new Date("2026-06-01T00:00:00Z"), [1,2,3,4,5])).toThrow("Valid leave dates");
  });
});
