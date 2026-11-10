import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { purchaseProduct } from "@/lib/services/checkout";
import { refundQuote, refundTransaction } from "@/lib/services/refunds";
import { DEMO_COACH_IDS, DEMO_MEMBER_ID } from "@/lib/seed/constants";
import { makeCtx } from "./helpers";

describe("purchase + refund flow", () => {
  it("coach package: splits 85/15 after fee, grants credits, refund reverses proportionally", async () => {
    const ctx = await makeCtx();
    const product = (await ctx.store.list("products", { where: { coach_id: DEMO_COACH_IDS.marcus } })).find((p) => p.name.includes("5 Boxing"))!;
    const { transaction, entitlement } = await purchaseProduct(ctx, { productId: product.id, memberId: DEMO_MEMBER_ID });
    expect(transaction.status).toBe("succeeded");
    expect(entitlement?.credits_total).toBe(5);

    const splits = await ctx.store.list("splits", { where: { transaction_id: transaction.id } });
    const by = (p: string) => splits.find((s) => s.party === p)!.amount_cents;
    expect(by("platform")).toBe(1200); // 3% of $400
    expect(by("coach")).toBe(32980); // 85% of 38,800
    expect(by("gym")).toBe(5820);

    const q = await refundQuote(ctx, transaction.id);
    expect(q.policyAmount).toBe(40000); // unused → full

    const refund = await refundTransaction(ctx, { transactionId: transaction.id, amountCents: 16000, reason: "Partial: 2 sessions" });
    expect(refund.credits_changed).toBe(2);
    const after = await ctx.store.list("splits", { where: { transaction_id: transaction.id } });
    expect(after.reduce((a, s) => a + s.reversed_cents, 0)).toBe(16000);
    expect(after.find((s) => s.party === "coach")!.reversed_cents).toBe(13192);
    const ent = await ctx.store.get("entitlements", entitlement!.id);
    expect(ent?.credits_total).toBe(3);
    const t = await ctx.store.get("transactions", transaction.id);
    expect(t?.status).toBe("partially_refunded");
    const log = await ctx.store.list("audit_log", { where: { entity_id: transaction.id } });
    expect(log.some((l) => l.action === "refund.created")).toBe(true);
  });

  it("refusing refunds above policy unless overridden", async () => {
    const ctx = await makeCtx();
    const pack = (await ctx.store.list("entitlements", { where: { status: "active", kind: "lesson" } })).find((e) => e.credits_used > 0 && e.transaction_id)!;
    const q = await refundQuote(ctx, pack.transaction_id!);
    expect(q.policyAmount).toBeLessThan(q.refundable);
    await expect(refundTransaction(ctx, { transactionId: pack.transaction_id!, amountCents: q.refundable, reason: "Wants everything back" })).rejects.toThrow(/Policy allows/);
    const r = await refundTransaction(ctx, { transactionId: pack.transaction_id!, amountCents: q.refundable, reason: "Coach injury: owner approved", override: true });
    expect(r.was_override).toBe(true);
    const log = await ctx.store.list("audit_log", { where: { action: "refund.override" } });
    expect(log.length).toBe(1);
  });

  it("intro offer is limited to one per member", async () => {
    const ctx = await makeCtx();
    const intro = (await ctx.store.list("products", { where: { kind: "intro" } })).find((p) => p.price_cents === 6000)!;
    await purchaseProduct(ctx, { productId: intro.id, memberId: DEMO_MEMBER_ID });
    await expect(purchaseProduct(ctx, { productId: intro.id, memberId: DEMO_MEMBER_ID })).rejects.toThrow(/limited to 1/);
  });

  it("sibling discount applies to family plans", async () => {
    const ctx = await makeCtx();
    const kids = (await ctx.store.list("products", { where: { family_eligible: true } }))[0];
    const { transaction } = await purchaseProduct(ctx, { productId: kids.id, memberId: DEMO_MEMBER_ID, siblingIndex: 1 });
    expect(transaction.total_cents).toBe(Math.round(kids.price_cents * 0.85));
  });
});
