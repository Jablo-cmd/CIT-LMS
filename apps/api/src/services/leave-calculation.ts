import { prisma } from "../db";

export function dateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function calculateWorkingLeaveDays(employeeId: string, firstDate: Date, lastDate: Date): Promise<number> {
  const first = dateOnlyUtc(firstDate);
  const last = dateOnlyUtc(lastDate);
  if (last < first) throw new Error("Last leave date must be on or after the first leave date");

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { workingSchedule: true }
  });
  if (!employee) throw new Error("Employee not found");

  // JavaScript UTC weekday numbering: Sunday=0 through Saturday=6.
  const workingDays = new Set(employee.workingSchedule?.workingDays ?? [1, 2, 3, 4, 5]);
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: first, lte: last }, countryCode: "ZA" },
    select: { date: true }
  });
  const holidayKeys = new Set(holidays.map(h => dateOnlyUtc(h.date).toISOString().slice(0, 10)));

  let count = 0;
  for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    if (workingDays.has(cursor.getUTCDay()) && !holidayKeys.has(key)) count += 1;
  }
  return count;
}
