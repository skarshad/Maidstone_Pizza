// Opening hours, open/closed status and order time slots. Pure: the current
// time is always passed in. All shop-local reasoning uses the shop's timezone
// (Europe/London), so it stays right across the clock changes.

export interface DayHours {
  /** 0 = Sunday ... 6 = Saturday, in the shop's timezone. */
  weekday: number;
  /** "HH:MM" (seconds, if present, are ignored). */
  opens: string;
  /** "HH:MM". At or before `opens` means closing after midnight. */
  closes: string;
  isClosed: boolean;
}

export interface ShopHours {
  timezone: string;
  hours: DayHours[];
  /** Local dates the shop is shut, as "YYYY-MM-DD". */
  closures: string[];
  /** Temporary "not taking orders" switch. */
  orderingPaused: boolean;
}

export interface OpenWindow {
  opensAt: Date;
  closesAt: Date;
}

export interface ShopStatus {
  /** Open and taking orders right now. */
  isOpen: boolean;
  closesAt: Date | null;
  /** When the shop next opens (null if open now, or nothing in the next 8 days). */
  nextOpensAt: Date | null;
  paused: boolean;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, timeZone: string): LocalParts {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  const out: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out as unknown as LocalParts;
}

/** The instant at which a wall-clock time occurs in a timezone. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  // Two passes settle the offset, including on the days the clocks change.
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}

/** "YYYY-MM-DD" for an instant, in the shop's timezone. */
export function localDate(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

/**
 * Opening windows for the local days from `fromOffset` to `toOffset` relative
 * to `now` (0 = today). Yesterday is included by callers because a late window
 * can still be running after midnight.
 */
export function openWindows(
  config: ShopHours,
  now: Date,
  fromOffset: number,
  toOffset: number,
): OpenWindow[] {
  const today = partsIn(now, config.timezone);
  const windows: OpenWindow[] = [];
  for (let offset = fromOffset; offset <= toOffset; offset++) {
    // Midday UTC of the target calendar day avoids any date slip.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const rule = config.hours.find((h) => h.weekday === day.getUTCDay());
    if (!rule || rule.isClosed) continue;
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (config.closures.includes(key)) continue;

    const opens = parseTime(rule.opens);
    const closes = parseTime(rule.closes);
    const opensAt = zonedTimeToUtc(y, m, d, opens.hour, opens.minute, config.timezone);
    const overnight = closes.hour * 60 + closes.minute <= opens.hour * 60 + opens.minute;
    const closesAt = zonedTimeToUtc(
      y,
      m,
      d + (overnight ? 1 : 0),
      closes.hour,
      closes.minute,
      config.timezone,
    );
    windows.push({ opensAt, closesAt });
  }
  return windows;
}

export function shopStatus(config: ShopHours, now: Date): ShopStatus {
  const windows = openWindows(config, now, -1, 8);
  const current = windows.find((w) => w.opensAt <= now && now < w.closesAt);
  const next = windows.find((w) => w.opensAt > now);
  return {
    isOpen: Boolean(current) && !config.orderingPaused,
    closesAt: current ? current.closesAt : null,
    nextOpensAt: current ? null : (next?.opensAt ?? null),
    paused: config.orderingPaused,
  };
}

export interface SlotOptions {
  /** Minutes from now before the earliest slot (the kitchen's preparation time). */
  leadMinutes: number;
  /** Gap between slots. */
  slotMinutes: number;
  /** How many days ahead can be booked (0 = today only). */
  maxDays: number;
}

/**
 * Times a customer can schedule an order for: on the slot grid, inside opening
 * hours, at least `leadMinutes` away, and at least `leadMinutes` after opening
 * (the kitchen needs time to cook once it opens).
 */
export function scheduleSlots(config: ShopHours, now: Date, options: SlotOptions): Date[] {
  const step = options.slotMinutes * 60_000;
  const lead = options.leadMinutes * 60_000;
  const earliest = now.getTime() + lead;
  const today = localDate(now, config.timezone);
  const slots: Date[] = [];

  for (const window of openWindows(config, now, -1, options.maxDays)) {
    const first = Math.max(window.opensAt.getTime() + lead, earliest);
    // Round up to the slot grid, measured from opening time.
    const offset = Math.ceil((first - window.opensAt.getTime()) / step) * step;
    for (let t = window.opensAt.getTime() + offset; t <= window.closesAt.getTime(); t += step) {
      slots.push(new Date(t));
    }
  }
  // Yesterday's window is only relevant while it is still running.
  return slots.filter((s) => s.getTime() >= earliest && localDate(s, config.timezone) >= today);
}

export function isBookableSlot(
  config: ShopHours,
  now: Date,
  when: Date,
  options: SlotOptions,
): boolean {
  return scheduleSlots(config, now, options).some((s) => s.getTime() === when.getTime());
}
