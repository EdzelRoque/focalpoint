export function getWeekBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const offsetToMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - offsetToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}
