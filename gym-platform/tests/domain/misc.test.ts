import { describe, expect, it } from "vitest";
import { expandSeries } from "@/lib/domain/recurrence";
import { nextRetryAt } from "@/lib/domain/dunning";
import { quote } from "@/lib/domain/pricing";
import { packageLiability, totalLiability } from "@/lib/domain/liability";
import { computeRetentionAlerts } from "@/lib/domain/retention";
import { allocate } from "@/lib/domain/money";

describe("expandSeries", () => {
  it("materializes weekly sessions in range, in gym time", () => {
    const out = expandSeries({ id: "s", weekday: 2, startTime: "18:00", durationMin: 60, startsOn: "2026-11-01", endsOn: null }, "2026-11-09", "2026-11-23", "America/New_York");
    expect(out.map((o) => o.startsAt.toISOString())).toEqual(["2026-11-10T23:00:00.000Z", "2026-11-17T23:00:00.000Z"]);
  });
  it("respects ends_on", () => {
    const out = expandSeries({ id: "s", weekday: 2, startTime: "18:00", durationMin: 60, startsOn: "2026-11-01", endsOn: "2026-11-12" }, "2026-11-09", "2026-11-30", "America/New_York");
    expect(out).toHaveLength(1);
  });
});

describe("dunning", () => {
  it("schedules retries then stops", () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    expect(nextRetryAt(t0, 1, [1, 3, 5])?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(nextRetryAt(t0, 3, [1, 3, 5])?.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(nextRetryAt(t0, 4, [1, 3, 5])).toBeNull();
  });
});

describe("quote", () => {
  it("applies sibling discount only from 2nd child", () => {
    expect(quote({ unitPriceCents: 12000, siblingIndex: 0, siblingDiscountBps: 1500, platformFeeBps: 300 }).totalCents).toBe(12000);
    expect(quote({ unitPriceCents: 12000, siblingIndex: 1, siblingDiscountBps: 1500, platformFeeBps: 300 }).totalCents).toBe(10200);
  });
  it("shows fee on top when customer pays it", () => {
    const q = quote({ unitPriceCents: 6000, platformFeeBps: 300, feePaidBy: "customer" });
    expect(q.totalCents).toBe(6180);
    expect(q.lines.some((l) => l.label === "Transaction fee")).toBe(true);
  });
});

describe("liability", () => {
  it("splits paid into earned/unearned by usage", () => {
    expect(packageLiability({ creditsTotal: 10, creditsUsed: 4, amountPaidCents: 50000, status: "active" })).toEqual({ earnedCents: 20000, unearnedCents: 30000 });
    expect(totalLiability([
      { creditsTotal: 10, creditsUsed: 4, amountPaidCents: 50000, status: "active" },
      { creditsTotal: 5, creditsUsed: 5, amountPaidCents: 40000, status: "exhausted" },
    ])).toEqual({ earnedCents: 60000, unearnedCents: 30000, count: 1 });
  });
});

describe("allocate", () => {
  it("sums exactly and respects caps", () => {
    const parts = allocate(100, [1, 1, 1], [100, 100, 100]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocate(10, [5, 5], [2, 100])).toEqual([2, 8]);
    expect(allocate(50, [1, 1, 1], [0, 0, 100])).toEqual([0, 0, 50]);
  });
});

describe("retention", () => {
  it("flags inactive, low packages and failed payments, worst first", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const alerts = computeRetentionAlerts({
      now,
      settings: { inactive_days: 10, package_low_credits: 2, membership_expiring_days: 14 },
      members: [
        { id: "a", name: "Ana", status: "active", lastAttendedAt: new Date("2026-10-25T00:00:00Z") },
        { id: "b", name: "Ben", status: "active", lastAttendedAt: new Date("2026-11-09T00:00:00Z") },
      ],
      packages: [{ memberId: "b", name: "10 privates", creditsTotal: 10, creditsUsed: 9, status: "active", expiresAt: null }],
      memberships: [],
      eligible: [],
      failedPayments: [{ memberId: "b", amount: "$150.00" }],
    });
    expect(alerts.map((a) => a.kind)).toEqual(["payment_failed", "inactive", "package_low"]);
  });
});
