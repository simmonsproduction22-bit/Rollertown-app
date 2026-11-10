import { describe, expect, it } from "vitest";
import { generateDemoDataset } from "@/lib/seed/generate";

const now = new Date("2026-11-10T15:00:00Z");
const d = generateDemoDataset(now);

describe("demo dataset", () => {
  it("has the demo gym, 3 coaches (1 independent) and 40 members", () => {
    expect(d.gyms[0].name).toBe("Demo MMA Academy");
    expect(d.coaches).toHaveLength(3);
    expect(d.coaches.filter((c) => c.employment === "independent")).toHaveLength(1);
    expect(d.members).toHaveLength(40);
  });
  it("is deterministic", () => {
    expect(generateDemoDataset(now).members.map((m) => m.id)).toEqual(d.members.map((m) => m.id));
  });
  it("splits always sum to the transaction total", () => {
    for (const t of d.transactions.filter((x) => x.status !== "failed")) {
      const sum = d.splits.filter((s) => s.transaction_id === t.id).reduce((a, s) => a + s.amount_cents, 0);
      expect(sum).toBe(t.total_cents);
    }
  });
  it("includes a refund whose reversals equal the refund amount", () => {
    expect(d.refunds).toHaveLength(1);
    const r = d.refunds[0];
    const reversed = d.splits.filter((s) => s.transaction_id === r.transaction_id).reduce((a, s) => a + s.reversed_cents, 0);
    expect(reversed).toBe(r.amount_cents);
  });
  it("never overbooks a class", () => {
    for (const s of d.class_sessions) {
      const n = d.class_bookings.filter((b) => b.session_id === s.id && ["booked", "attended"].includes(b.status)).length;
      expect(n).toBeLessThanOrEqual(s.capacity);
    }
  });
  it("references only existing members", () => {
    const ids = new Set(d.members.map((m) => m.id));
    for (const t of ["class_bookings", "check_ins", "entitlements", "memberships", "member_ranks"] as const) {
      for (const row of d[t] as { member_id: string }[]) expect(ids.has(row.member_id)).toBe(true);
    }
  });
  it("has a fight team with records and kids with guardians", () => {
    expect(d.fighters.length).toBeGreaterThanOrEqual(5);
    expect(d.fights.length).toBeGreaterThan(15);
    expect(d.guardians.length).toBeGreaterThanOrEqual(12);
  });
});
