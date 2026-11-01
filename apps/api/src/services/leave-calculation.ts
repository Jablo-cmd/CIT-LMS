import { prisma } from "../db.js";

export function dateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function countWorkingDays(firstDate: Date, lastDate: Date, workingDayNumbers: number[], holidayDateKeys: string[] = []): number {
  const first = dateOnlyUtc(firstDate);
  const last = dateOnlyUtc(lastDate);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) throw new Error("Valid leave dates are required");
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

export async function calculateWorkingLeaveDays(employeeId: string, firstDate: Date, lastDate: Date): Promise<number> {
  const first = dateOnlyUtc(firstDate);
  const last = dateOnlyUtc(lastDate);
  if (last < first) throw new Error("Last leave date must be on or after the first leave date");
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { workingSchedule: true } });
  if (!employee) throw new Error("Employee not found");
  const workingDays = employee.workingSchedule?.workingDays ?? [1, 2, 3, 4, 5];
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: first, lte: last }, countryCode: "ZA" },
    select: { date: true }
  });
  return countWorkingDays(first, last, workingDays, holidays.map(h => dateOnlyUtc(h.date).toISOString().slice(0, 10)));
}
