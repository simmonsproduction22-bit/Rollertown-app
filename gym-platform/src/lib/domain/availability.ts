/** Private-lesson slot generation, timezone aware (no external deps). */

export interface Window {
  readonly weekday: number; // 0 = Sunday
  readonly startTime: string; // "HH:MM"
  readonly endTime: string;
}

export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

export interface Slot {
  readonly start: Date;
  readonly end: Date;
  readonly label: string;
}

function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60_000;
}

/** Wall-clock date + time in `tz` → UTC Date. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset1 = tzOffsetMinutes(new Date(guess), tz);
  const candidate = guess - offset1 * 60_000;
  const offset2 = tzOffsetMinutes(new Date(candidate), tz);
  return new Date(guess - offset2 * 60_000);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatTime(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function computeSlots(args: {
  date: string;
  tz: string;
  windows: readonly Window[];
  busy: readonly Interval[];
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  stepMin: number;
  now: Date;
}): Slot[] {
  const wd = weekdayOf(args.date);
  const minute = 60_000;
  const slots: Slot[] = [];
  for (const w of args.windows.filter((x) => x.weekday === wd)) {
    const winStart = zonedToUtc(args.date, w.startTime, args.tz).getTime();
    const winEnd = zonedToUtc(args.date, w.endTime, args.tz).getTime();
    for (let t = winStart; t + args.durationMin * minute <= winEnd; t += args.stepMin * minute) {
      const start = new Date(t);
      const end = new Date(t + args.durationMin * minute);
      if (start <= args.now) continue;
      const padded = {
        start: new Date(t - args.bufferBeforeMin * minute),
        end: new Date(end.getTime() + args.bufferAfterMin * minute),
      };
      if (args.busy.some((b) => overlaps(padded, b))) continue;
      slots.push({ start, end, label: formatTime(start, args.tz) });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
