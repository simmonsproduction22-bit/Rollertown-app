import { describe, expect, it } from "vitest";
import { computeSplits, sumSplits } from "@/lib/domain/splits";
import { computeRefundReversal } from "@/lib/domain/refunds";

describe("computeSplits", () => {
  it("gym-only sale: platform fee + gym share sum to total", () => {
    const s = computeSplits({ totalCents: 15000, platformFeeBps: 300 });
    expect(s).toEqual([
      { party: "platform", coachId: null, amountCents: 450 },
      { party: "gym", coachId: null, amountCents: 14550 },
    ]);
  });

  it("coach product 70/30 splits the net after the platform fee", () => {
    const s = computeSplits({ totalCents: 10000, platformFeeBps: 300, coachId: "c1", coachSplitBps: 7000 });
    expect(s.find((x) => x.party === "platform")?.amountCents).toBe(300);
    expect(s.find((x) => x.party === "coach")?.amountCents).toBe(6790);
    expect(s.find((x) => x.party === "gym")?.amountCents).toBe(2910);
    expect(sumSplits(s)).toBe(10000);
  });

  it("per-session mat rent moves money from coach to gym", () => {
    const s = computeSplits({ totalCents: 10000, platformFeeBps: 300, coachId: "c1", coachSplitBps: 10000, perSessionRentCents: 1500 });
    expect(s.find((x) => x.party === "coach")?.amountCents).toBe(9700 - 1500);
    expect(s.find((x) => x.party === "gym")?.amountCents).toBe(1500);
    expect(sumSplits(s)).toBe(10000);
  });

  it("rent never exceeds the coach share", () => {
    const s = computeSplits({ totalCents: 1000, platformFeeBps: 300, coachId: "c1", coachSplitBps: 5000, perSessionRentCents: 5000 });
    expect(s.find((x) => x.party === "coach")?.amountCents).toBe(0);
    expect(sumSplits(s)).toBe(1000);
  });

  it("rounding always sums exactly to total", () => {
    for (const total of [1, 99, 333, 12345, 99999]) {
      const s = computeSplits({ totalCents: total, platformFeeBps: 300, coachId: "c", coachSplitBps: 6667 });
      expect(sumSplits(s)).toBe(total);
    }
  });

  it("rejects bad input", () => {
    expect(() => computeSplits({ totalCents: -1, platformFeeBps: 300 })).toThrow();
    expect(() => computeSplits({ totalCents: 100, platformFeeBps: 300, coachSplitBps: 12000, coachId: "c" })).toThrow();
  });
});

describe("computeRefundReversal", () => {
  const splits = [
    { id: "p", party: "platform" as const, coachId: null, amountCents: 300, reversedCents: 0 },
    { id: "c", party: "coach" as const, coachId: "c1", amountCents: 6790, reversedCents: 0 },
    { id: "g", party: "gym" as const, coachId: null, amountCents: 2910, reversedCents: 0 },
  ];

  it("full refund reverses every split completely", () => {
    const r = computeRefundReversal({ splits, totalCents: 10000, refundedCents: 0, refundCents: 10000 });
    expect(r.map((x) => x.reverseCents)).toEqual([300, 6790, 2910]);
  });

  it("partial refund reverses proportionally and sums to refund", () => {
    const r = computeRefundReversal({ splits, totalCents: 10000, refundedCents: 0, refundCents: 5000 });
    expect(r.reduce((a, b) => a + b.reverseCents, 0)).toBe(5000);
    expect(r.find((x) => x.splitId === "c")?.reverseCents).toBe(3395);
    expect(r.find((x) => x.splitId === "p")?.reverseCents).toBe(150);
  });

  it("second partial refund never over-reverses a split", () => {
    const after = splits.map((s) => ({ ...s, reversedCents: Math.round(s.amountCents * 0.6) }));
    const r = computeRefundReversal({ splits: after, totalCents: 10000, refundedCents: 6000, refundCents: 4000 });
    r.forEach((x) => {
      const s = after.find((y) => y.id === x.splitId)!;
      expect(x.reverseCents).toBeLessThanOrEqual(s.amountCents - s.reversedCents);
    });
    expect(r.reduce((a, b) => a + b.reverseCents, 0)).toBe(4000);
  });

  it("refusing to refund more than remains", () => {
    expect(() => computeRefundReversal({ splits, totalCents: 10000, refundedCents: 9000, refundCents: 2000 })).toThrow(/exceeds/);
  });
});
