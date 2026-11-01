export function calculateElapsedHours(start: string, finish: string): number {
  const timePattern = /^([01]\\d|2[0-3]):[0-5]\\d$/;
  if (!timePattern.test(start) || !timePattern.test(finish)) throw new Error("Times must use 24-hour HH:MM format");
  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);
  let minutes = finishHour * 60 + finishMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}
