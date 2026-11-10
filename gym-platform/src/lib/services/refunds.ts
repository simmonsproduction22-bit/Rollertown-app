import { z } from "zod";
import { creditsForRefund, quotePackageRefund } from "@/lib/domain/policy";
import { computeRefundReversal } from "@/lib/domain/refunds";
import type { Refund } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";
import { emitWebhook } from "./webhooks";

export const refundSchema = z.object({
  transactionId: z.string().uuid(),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().trim().min(3, "Add a short reason").max(300),
  creditsAction: z.enum(["auto", "restore", "remove", "none"]).default("auto"),
  override: z.boolean().default(false),
});

/** Policy quote shown before a refund: what the gym's rules allow. */
export async function refundQuote(ctx: Ctx, transactionId: string) {
  const txn = await mustGet(ctx, "transactions", transactionId);
  const refundable = txn.total_cents - txn.refunded_cents;
  const ent = await ctx.store.first("entitlements", { where: { transaction_id: txn.id } });
  if (!ent) return { refundable, policyAmount: refundable, rule: "Full refund (no package attached)", creditsUnused: 0 };
  const mode = ctx.gym.settings.refunds.package_refund_mode;
  const q = quotePackageRefund({ creditsTotal: ent.credits_total, creditsUsed: ent.credits_used, amountPaidCents: ent.amount_paid_cents, refundedCents: txn.refunded_cents }, mode);
  const rule = mode === "unused_prorated" ? "Unused sessions refunded pro-rata" : mode === "full_if_unused" ? "Full refund only if no sessions used" : "Packages are non-refundable";
  return { refundable, policyAmount: q.amountCents, rule, creditsUnused: ent.credits_total - ent.credits_used };
}

/**
 * One-tap refund (full or partial). Reverses coach + gym (+ fee) splits
 * proportionally, adjusts lesson credits, and writes an audit entry.
 * Amounts above the policy quote require `override` (managers only).
 */
export async function refundTransaction(ctx: Ctx, input: z.input<typeof refundSchema>): Promise<Refund> {
  const args = refundSchema.parse(input);
  const txn = await mustGet(ctx, "transactions", args.transactionId);
  if (!["succeeded", "partially_refunded"].includes(txn.status)) throw new AppError("Only successful payments can be refunded.");
  const q = await refundQuote(ctx, txn.id);
  const amount = args.amountCents ?? (args.override ? q.refundable : q.policyAmount);
  if (amount <= 0) throw new AppError(`Policy allows no refund here (${q.rule}). Use override to refund anyway.`);
  if (amount > q.refundable) throw new AppError("Refund exceeds what's left on this payment.");
  if (amount > q.policyAmount && !args.override) throw new AppError(`Policy allows up to $${(q.policyAmount / 100).toFixed(2)} (${q.rule}). Turn on override to refund more.`);
  if (args.override && !ctx.gym.settings.refunds.allow_staff_override) throw new AppError("Refund overrides are disabled in Settings → Policies.");

  const splits = await ctx.store.list("splits", { where: { transaction_id: txn.id } });
  const reversal = computeRefundReversal({
    splits: splits.map((s) => ({ id: s.id, party: s.party, coachId: s.coach_id, amountCents: s.amount_cents, reversedCents: s.reversed_cents })),
    totalCents: txn.total_cents, refundedCents: txn.refunded_cents, refundCents: amount,
  });

  const stripeRefund = txn.stripe_payment_intent_id
    ? await ctx.payments.refund({ paymentIntentId: txn.stripe_payment_intent_id, amountCents: amount, reason: args.reason })
    : { refundId: null };
  for (const r of reversal) {
    const split = splits.find((s) => s.id === r.splitId)!;
    if (r.reverseCents > 0 && split.stripe_transfer_id) await ctx.payments.reverseTransfer({ transferId: split.stripe_transfer_id, amountCents: r.reverseCents });
    await ctx.store.update("splits", split.id, { reversed_cents: split.reversed_cents + r.reverseCents });
  }
  const refunded = txn.refunded_cents + amount;
  await ctx.store.update("transactions", txn.id, { refunded_cents: refunded, status: refunded >= txn.total_cents ? "refunded" : "partially_refunded" });

  const credits = await adjustCredits(ctx, txn.id, amount, args.creditsAction);
  const refund = await ctx.store.insert("refunds", {
    gym_id: ctx.gym.id, transaction_id: txn.id, amount_cents: amount, reason: args.reason, credits_action: credits.action,
    credits_changed: credits.changed, policy_applied: q.rule, was_override: args.override, stripe_refund_id: stripeRefund.refundId,
    created_by: ctx.actor.userId, created_at: ctx.now().toISOString(),
  });
  await audit(ctx, args.override ? "refund.override" : "refund.created", "transactions", txn.id, {
    amount_cents: amount, reason: args.reason, policy: q.rule, credits: credits, reversals: reversal.map((r) => ({ party: r.party, cents: r.reverseCents })),
  });
  await emitWebhook(ctx, "payment.refunded", { transaction_id: txn.id, amount_cents: amount });
  return refund;
}

async function adjustCredits(ctx: Ctx, transactionId: string, amount: number, mode: "auto" | "restore" | "remove" | "none") {
  const ent = await ctx.store.first("entitlements", { where: { transaction_id: transactionId } });
  if (!ent || mode === "none") return { action: "none" as const, changed: 0 };
  const now = ctx.now().toISOString();
  if (mode === "restore") {
    // Refunding a used session's money while giving the credit back (e.g. coach no-show).
    const restore = Math.min(1, ent.credits_used);
    await ctx.store.update("entitlements", ent.id, { credits_used: ent.credits_used - restore, status: "active" });
    await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: ent.id, delta: restore, reason: "refund_restore", ref_id: transactionId, created_at: now });
    return { action: "restore" as const, changed: restore };
  }
  const remove = creditsForRefund({ creditsTotal: ent.credits_total, creditsUsed: ent.credits_used, amountPaidCents: ent.amount_paid_cents }, amount);
  if (remove <= 0) return { action: "none" as const, changed: 0 };
  const newTotal = ent.credits_total - remove;
  await ctx.store.update("entitlements", ent.id, {
    credits_total: Math.max(newTotal, ent.credits_used, 1), amount_paid_cents: Math.max(0, ent.amount_paid_cents - amount),
    status: newTotal <= ent.credits_used ? (ent.credits_used === 0 ? "refunded" : "exhausted") : "active",
  });
  await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: ent.id, delta: -remove, reason: "refund_remove", ref_id: transactionId, created_at: now });
  return { action: "remove" as const, changed: remove };
}
