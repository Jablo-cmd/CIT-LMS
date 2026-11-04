export type LeaveLedgerTransaction = {
  transactionType: string;
  days: unknown;
};

/** Signed effect of one persisted ledger row on the employee's leave balance. */
export function leaveLedgerDelta(transaction: LeaveLedgerTransaction): number {
  const days = Number(transaction.days);
  if (!Number.isFinite(days)) throw new TypeError("Leave ledger days must be numeric");
  switch (transaction.transactionType) {
    case "DEDUCTION": return -days;
    case "ADJUSTMENT":
    case "REVERSAL": return days;
    case "VOID": return 0;
    default: throw new TypeError(`Unsupported leave transaction type: ${transaction.transactionType}`);
  }
}
