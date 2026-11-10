import { describe, expect, it } from "vitest";
import { evaluateCancellation, quotePackageRefund } from "@/lib/domain/policy";

const policy = { window_hours: 12, late_cancel_fee_cents: 1500, no_show_fee_cents: 2000, late_cancel_consumes_credit: true };
const start = new Date("2026-11-12T18:00:00Z");

describe("evaluateCancellation", () => {
  it("free cancel outside the window restores credit", () => {
    const r = evaluateCancellation({ startsAt: start, now: new Date("2026-11-12T05:00:00Z"), policy });
    expect(r).toMatchObject({ kind: "free", feeCents: 0, restoreCredit: true });
  });
  it("late cancel inside the window charges the fee and keeps the credit", () => {
    const r = evaluateCancellation({ startsAt: start, now: new Date("2026-11-12T08:00:00Z"), policy });
    expect(r).toMatchObject({ kind: "late", feeCents: 1500, restoreCredit: false });
  });
  it("after start is a no-show", () => {
    const r = evaluateCancellation({ startsAt: start, now: new Date("2026-11-12T18:30:00Z"), policy });
    expect(r).toMatchObject({ kind: "no_show", feeCents: 2000 });
  });
  it("staff override waives everything", () => {
    const r = evaluateCancellation({ startsAt: start, now: new Date("2026-11-12T17:00:00Z"), policy, override: true });
    expect(r).toMatchObject({ kind: "free", feeCents: 0, restoreCredit: true, overridden: true });
  });
});

describe("quotePackageRefund", () => {
  const ent = { creditsTotal: 10, creditsUsed: 3, amountPaidCents: 50000, refundedCents: 0 };
  it("unused_prorated refunds the unused share", () => {
    expect(quotePackageRefund(ent, "unused_prorated")).toEqual({ amountCents: 35000, creditsToRemove: 7 });
  });
  it("full_if_unused only refunds untouched packs", () => {
    expect(quotePackageRefund(ent, "full_if_unused").amountCents).toBe(0);
    expect(quotePackageRefund({ ...ent, creditsUsed: 0 }, "full_if_unused").amountCents).toBe(50000);
  });
  it("none refunds nothing", () => {
    expect(quotePackageRefund(ent, "none").amountCents).toBe(0);
  });
  it("accounts for amounts already refunded", () => {
    expect(quotePackageRefund({ ...ent, refundedCents: 10000 }, "unused_prorated").amountCents).toBe(25000);
  });
});
