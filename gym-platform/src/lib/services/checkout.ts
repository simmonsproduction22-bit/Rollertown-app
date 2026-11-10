import { z } from "zod";
import { quote } from "@/lib/domain/pricing";
import { computeSplits } from "@/lib/domain/splits";
import type { Coach, Entitlement, Member, Membership, Product, Transaction } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";
import { emitWebhook } from "./webhooks";

export const checkoutSchema = z.object({
  productId: z.string().uuid(),
  memberId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
  siblingIndex: z.number().int().min(0).max(10).default(0),
});

export interface CheckoutResult {
  readonly transaction: Transaction;
  readonly entitlement: Entitlement | null;
  readonly membership: Membership | null;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Charge a member's saved card for a product and grant what they bought. */
export async function purchaseProduct(ctx: Ctx, input: z.input<typeof checkoutSchema>): Promise<CheckoutResult> {
  const args = checkoutSchema.parse(input);
  const product = await mustGet(ctx, "products", args.productId);
  if (!product.is_active) throw new AppError("This product is no longer available.");
  const member = await mustGet(ctx, "members", args.memberId);
  if (product.max_per_member) {
    const prior = await ctx.store.count("transactions", { where: { member_id: member.id, product_id: product.id, status: { in: ["succeeded", "partially_refunded"] } } });
    if (prior >= product.max_per_member) throw new AppError(`${product.name} is limited to ${product.max_per_member} per person.`);
  }
  const coach = product.coach_id ? await mustGet(ctx, "coaches", product.coach_id) : null;
  const q = quote({
    unitPriceCents: product.price_cents, quantity: args.quantity, siblingIndex: product.family_eligible ? args.siblingIndex : 0,
    siblingDiscountBps: product.sibling_discount_bps, platformFeeBps: ctx.gym.platform_fee_bps, feePaidBy: ctx.gym.settings.fee_paid_by,
  });
  const txn = await chargeAndSplit(ctx, { member, coach, product, totalCents: q.totalCents, subtotalCents: q.subtotalCents, discountCents: q.discountCents, description: product.name, items: [{ name: product.name, quantity: args.quantity, unit_price_cents: product.price_cents, product_id: product.id }] });
  if (txn.status !== "succeeded") return { transaction: txn, entitlement: null, membership: null };
  const granted = await grantProduct(ctx, { member, product, txn, quantity: args.quantity, discountBps: product.family_eligible && args.siblingIndex > 0 ? product.sibling_discount_bps : 0 });
  return { transaction: txn, ...granted };
}

async function grantProduct(ctx: Ctx, a: { member: Member; product: Product; txn: Transaction; quantity: number; discountBps: number }) {
  const now = ctx.now();
  const p = a.product;
  if (p.kind === "membership") {
    const periodDays = p.interval === "year" ? 365 : p.interval === "week" ? 7 : 30;
    const membership = await ctx.store.insert("memberships", {
      gym_id: ctx.gym.id, member_id: a.member.id, product_id: p.id, family_id: a.member.family_id, status: "active",
      price_cents: a.txn.total_cents, discount_bps: a.discountBps, started_on: now.toISOString().slice(0, 10),
      current_period_end: addDays(now, periodDays).toISOString().slice(0, 10), cancel_at_period_end: false, cancelled_on: null,
      stripe_subscription_id: null, failed_payment_count: 0, created_at: now.toISOString(),
    });
    await ctx.store.update("transactions", a.txn.id, { membership_id: membership.id });
    if (a.member.status !== "active") await ctx.store.update("members", a.member.id, { status: "active" });
    return { entitlement: null, membership };
  }
  const credits = (p.lesson_credits ?? p.class_credits ?? 0) * a.quantity;
  if (credits === 0) return { entitlement: null, membership: null };
  const expiryDays = p.expires_after_days ?? ctx.gym.settings.packages.default_expiration_days;
  const entitlement = await ctx.store.insert("entitlements", {
    gym_id: ctx.gym.id, member_id: a.member.id, product_id: p.id, coach_id: p.coach_id, transaction_id: a.txn.id,
    kind: p.lesson_credits ? "lesson" : "class", credits_total: credits, credits_used: 0, amount_paid_cents: a.txn.total_cents,
    purchased_at: now.toISOString(), expires_at: addDays(now, expiryDays).toISOString(), status: "active", migrated: false,
  });
  await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: entitlement.id, delta: credits, reason: "purchase", ref_id: a.txn.id, created_at: now.toISOString() });
  return { entitlement, membership: null };
}

/**
 * Core money path used by every sale (products, privates, POS, fees):
 * creates the transaction, charges, records splits and sends transfers.
 */
export async function chargeAndSplit(ctx: Ctx, a: {
  member: Member | null; coach: Coach | null; product: Product | null; totalCents: number; subtotalCents?: number; discountCents?: number;
  description: string; payerEmail?: string | null; items: { name: string; quantity: number; unit_price_cents: number; product_id?: string | null; inventory_item_id?: string | null }[];
  perSessionRentCents?: number; paymentMethodId?: string | null;
}): Promise<Transaction> {
  const now = ctx.now().toISOString();
  const lines = computeSplits({
    totalCents: a.totalCents, platformFeeBps: ctx.gym.platform_fee_bps, coachId: a.coach?.id ?? null,
    coachSplitBps: a.product?.coach_split_bps ?? a.coach?.default_coach_split_bps, perSessionRentCents: a.perSessionRentCents,
  });
  const receiptCount = await ctx.store.count("transactions", { where: { gym_id: ctx.gym.id } });
  let txn = await ctx.store.insert("transactions", {
    gym_id: ctx.gym.id, member_id: a.member?.id ?? null, coach_id: a.coach?.id ?? null, product_id: a.product?.id ?? null,
    description: a.description, subtotal_cents: a.subtotalCents ?? a.totalCents, discount_cents: a.discountCents ?? 0,
    platform_fee_cents: lines[0].amountCents, total_cents: a.totalCents, status: "pending",
    payer_email: a.payerEmail ?? a.member?.email ?? null, receipt_number: `R-${2000 + receiptCount}`, created_at: now,
  });
  txn = await ctx.store.update("transactions", txn.id, { transfer_group: `txn_${txn.id}` });
  for (const it of a.items) {
    await ctx.store.insert("transaction_items", { gym_id: ctx.gym.id, transaction_id: txn.id, product_id: it.product_id ?? null, inventory_item_id: it.inventory_item_id ?? null, name: it.name, quantity: it.quantity, unit_price_cents: it.unit_price_cents });
  }

  if (a.totalCents === 0) {
    return ctx.store.update("transactions", txn.id, { status: "succeeded" });
  }

  const pm = a.member ? await ctx.store.first("payment_methods", { where: { member_id: a.member.id, is_default: true } }) : null;
  const charge = await ctx.payments.chargeSavedCard({
    customerId: a.member?.stripe_customer_id ?? (ctx.payments.mode === "stub" ? "cus_stub" : null),
    paymentMethodId: a.paymentMethodId ?? pm?.stripe_payment_method_id ?? (ctx.payments.mode === "stub" ? "pm_stub" : null),
    amountCents: a.totalCents, currency: ctx.gym.currency, description: a.description, transferGroup: txn.transfer_group ?? txn.id,
    metadata: { gym_id: ctx.gym.id, transaction_id: txn.id },
  });
  if (charge.status !== "succeeded") {
    const failed = await ctx.store.update("transactions", txn.id, {
      status: "failed", stripe_payment_intent_id: charge.paymentIntentId || null, failure_reason: charge.failureReason ?? "Payment failed",
      next_retry_at: new Date(ctx.now().getTime() + (ctx.gym.settings.dunning.retry_days[0] ?? 1) * 86_400_000).toISOString(),
    });
    await emitWebhook(ctx, "payment.failed", { transaction_id: failed.id, amount_cents: failed.total_cents });
    return failed;
  }
  txn = await ctx.store.update("transactions", txn.id, { status: "succeeded", stripe_payment_intent_id: charge.paymentIntentId, stripe_charge_id: charge.chargeId });
  await recordSplits(ctx, txn, lines, a.coach);
  await emitWebhook(ctx, "payment.succeeded", { transaction_id: txn.id, amount_cents: txn.total_cents, member_id: txn.member_id });
  await audit(ctx, "payment.succeeded", "transactions", txn.id, { amount_cents: txn.total_cents });
  return txn;
}

export async function recordSplits(ctx: Ctx, txn: Transaction, lines: ReturnType<typeof computeSplits>, coach: Coach | null): Promise<void> {
  for (const l of lines) {
    let transferId: string | null = null;
    const destination = l.party === "gym" ? ctx.gym.stripe_account_id : l.party === "coach" ? coach?.stripe_account_id : null;
    if (destination && l.amountCents > 0) {
      transferId = (await ctx.payments.transfer({ amountCents: l.amountCents, currency: ctx.gym.currency, destination, transferGroup: txn.transfer_group ?? txn.id, sourceCharge: txn.stripe_charge_id })).transferId;
    }
    await ctx.store.insert("splits", { gym_id: ctx.gym.id, transaction_id: txn.id, party: l.party, coach_id: l.coachId, amount_cents: l.amountCents, reversed_cents: 0, stripe_transfer_id: transferId, payout_id: null, created_at: txn.created_at });
  }
}
