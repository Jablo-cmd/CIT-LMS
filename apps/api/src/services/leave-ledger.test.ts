import { describe, expect, it } from "vitest";
import { leaveLedgerDelta } from "./leave-ledger.js";

describe("leave ledger deltas", () => {
  it("subtracts deductions", () => expect(leaveLedgerDelta({ transactionType: "DEDUCTION", days: "2.5" })).toBe(-2.5));
  it("applies signed adjustments", () => {
    expect(leaveLedgerDelta({ transactionType: "ADJUSTMENT", days: "3.00" })).toBe(3);
    expect(leaveLedgerDelta({ transactionType: "ADJUSTMENT", days: "-1.50" })).toBe(-1.5);
  });
  it("applies signed reversals", () => {
    expect(leaveLedgerDelta({ transactionType: "REVERSAL", days: "2.00" })).toBe(2);
    expect(leaveLedgerDelta({ transactionType: "REVERSAL", days: "-2.00" })).toBe(-2);
  });
  it("does not count voided entries", () => expect(leaveLedgerDelta({ transactionType: "VOID", days: "9.00" })).toBe(0));
  it("rejects non-numeric ledger values and unknown transaction types", () => {
    expect(() => leaveLedgerDelta({ transactionType: "DEDUCTION", days: "NaN" })).toThrow(TypeError);
    expect(() => leaveLedgerDelta({ transactionType: "OTHER", days: "1" })).toThrow(TypeError);
  });
});
