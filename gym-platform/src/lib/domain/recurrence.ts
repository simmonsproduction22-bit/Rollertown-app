import { zonedToUtc, weekdayOf } from "./availability";

export interface SeriesRule {
  readonly id: string;
  readonly weekday: number;
  readonly startTime: string; // HH:MM
  readonly durationMin: number;
  readonly startsOn: string; // YYYY-MM-DD
  readonly endsOn: string | null;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Expand a weekly rule into concrete session times between [from, to]. */
export function expandSeries(rule: SeriesRule, from: string, to: string, tz: string): { startsAt: Date; endsAt: Date }[] {
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const first = from > rule.startsOn ? from : rule.startsOn;
  const last = rule.endsOn && rule.endsOn < to ? rule.endsOn : to;
  const offset = (rule.weekday - weekdayOf(first) + 7) % 7;
  for (let day = addDays(first, offset); day <= last; day = addDays(day, 7)) {
    const startsAt = zonedToUtc(day, rule.startTime, tz);
    out.push({ startsAt, endsAt: new Date(startsAt.getTime() + rule.durationMin * 60_000) });
  }
  return out;
}
