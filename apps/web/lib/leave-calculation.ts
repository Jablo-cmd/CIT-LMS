/** Pure working-day calculation — must stay aligned with public.count_working_days SQL */
export function countWorkingDays(
  firstDate: Date,
  lastDate: Date,
  workingDayNumbers: number[],
  holidayDateKeys: string[] = []
): number {
  const first = dateOnlyUtc(firstDate);
  const last = dateOnlyUtc(lastDate);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    throw new Error("Valid leave dates are required");
  }
  if (last < first) throw new Error("Last leave date must be on or after the first leave date");
  const workingDays = new Set(workingDayNumbers);
  const holidays = new Set(holidayDateKeys);
  let count = 0;
  for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    if (workingDays.has(cursor.getUTCDay()) && !holidays.has(key)) count += 1;
  }
  return count;
}

export function dateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
