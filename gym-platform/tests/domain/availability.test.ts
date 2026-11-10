import { describe, expect, it } from "vitest";
import { computeSlots, zonedToUtc } from "@/lib/domain/availability";

const tz = "America/New_York";

describe("zonedToUtc", () => {
  it("handles EST offset", () => {
    expect(zonedToUtc("2026-11-12", "09:00", tz).toISOString()).toBe("2026-11-12T14:00:00.000Z");
  });
  it("handles EDT offset", () => {
    expect(zonedToUtc("2026-07-01", "09:00", tz).toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
});

describe("computeSlots", () => {
  const windows = [{ weekday: 4, startTime: "09:00", endTime: "12:00" }]; // Thursday
  it("produces slots inside the window at the step size", () => {
    const slots = computeSlots({ date: "2026-11-12", tz, windows, busy: [], durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, stepMin: 30, now: new Date("2026-11-01T00:00:00Z") });
    expect(slots.map((s) => s.label)).toEqual(["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"]);
  });
  it("respects busy intervals and buffers", () => {
    const busy = [{ start: zonedToUtc("2026-11-12", "10:00", tz), end: zonedToUtc("2026-11-12", "11:00", tz) }];
    const slots = computeSlots({ date: "2026-11-12", tz, windows, busy, durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 15, stepMin: 30, now: new Date("2026-11-01T00:00:00Z") });
    // 9:00 + 60m + 15m buffer = 10:15 overlaps the 10:00 booking, so only 11:00 fits.
    expect(slots.map((s) => s.label)).toEqual(["11:00 AM"]);
  });
  it("returns nothing on days without availability", () => {
    expect(computeSlots({ date: "2026-11-13", tz, windows, busy: [], durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, stepMin: 30, now: new Date("2026-11-01T00:00:00Z") })).toEqual([]);
  });
  it("hides past slots", () => {
    const slots = computeSlots({ date: "2026-11-12", tz, windows, busy: [], durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, stepMin: 30, now: zonedToUtc("2026-11-12", "10:10", tz) });
    expect(slots[0].label).toBe("10:30 AM");
  });
});
