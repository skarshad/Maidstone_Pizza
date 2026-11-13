export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * When "sold out for today" ends: the next 5am on this device's clock, so an
 * item marked sold out during evening service is back for the next day.
 */
export function endOfTradingDay(now: Date): string {
  const end = new Date(now);
  end.setHours(5, 0, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  return end.toISOString();
}
