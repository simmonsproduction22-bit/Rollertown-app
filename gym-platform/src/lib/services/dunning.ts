import { nextRetryAt, dunningMessage } from "@/lib/domain/dunning";
import { formatCents } from "@/lib/domain/money";
import { env } from "@/lib/env";
import { computeSplits } from "@/lib/domain/splits";
import { mustGet, type Ctx } from "./context";
import { notifyMember } from "./notify";
import { recordSplits } from "./checkout";

/** Retries a failed payment; on failure sends dunning SMS/email with a card-update link. */
export async function retryFailedPayment(ctx: Ctx, transactionId: string) {
  const txn = await mustGet(ctx, "transactions", transactionId);
  if (txn.status !== "failed" || !txn.member_id) return txn;
  const member = await mustGet(ctx, "members", txn.member_id);
  const pm = await ctx.store.first("payment_methods", { where: { member_id: member.id, is_default: true } });
  const charge = await ctx.payments.chargeSavedCard({ customerId: member.stripe_customer_id ?? (ctx.payments.mode === "stub" ? "cus_stub" : null), paymentMethodId: pm?.stripe_payment_method_id ?? null, amountCents: txn.total_cents, currency: ctx.gym.currency, description: txn.description, transferGroup: txn.transfer_group ?? txn.id, metadata: { transaction_id: txn.id, retry: String(txn.attempt_count + 1) } });
  const attempt = txn.attempt_count + 1;
  await ctx.store.insert("dunning_attempts", { gym_id: ctx.gym.id, transaction_id: txn.id, attempt, channel: "retry", outcome: charge.status === "succeeded" ? "succeeded" : charge.failureReason ?? "failed", created_at: ctx.now().toISOString() });
  if (charge.status === "succeeded") {
    const ok = await ctx.store.update("transactions", txn.id, { status: "succeeded", attempt_count: attempt, next_retry_at: null, failure_reason: null, stripe_payment_intent_id: charge.paymentIntentId, stripe_charge_id: charge.chargeId });
    const coach = ok.coach_id ? await ctx.store.get("coaches", ok.coach_id) : null;
    await recordSplits(ctx, ok, computeSplits({ totalCents: ok.total_cents, platformFeeBps: ctx.gym.platform_fee_bps, coachId: coach?.id ?? null, coachSplitBps: coach?.default_coach_split_bps }), coach);
    if (ok.membership_id) await ctx.store.update("memberships", ok.membership_id, { status: "active", failed_payment_count: 0 });
    if (member.status === "past_due") await ctx.store.update("members", member.id, { status: "active" });
    return ok;
  }
  const first = new Date(txn.created_at);
  const retryAt = nextRetryAt(first, attempt, ctx.gym.settings.dunning.retry_days);
  const updated = await ctx.store.update("transactions", txn.id, { attempt_count: attempt, next_retry_at: retryAt?.toISOString() ?? null, failure_reason: charge.failureReason ?? txn.failure_reason });
  if (txn.membership_id) await ctx.store.update("memberships", txn.membership_id, { status: "past_due", failed_payment_count: attempt });
  await ctx.store.update("members", member.id, { status: "past_due" });
  const body = dunningMessage({ firstName: member.first_name, gymName: ctx.gym.name, amount: formatCents(txn.total_cents), updateUrl: `${env.appUrl}/m/pay?update=1`, finalNotice: !retryAt });
  await notifyMember(ctx, member, { category: "dunning", sms: body, subject: "Payment didn't go through", refId: txn.id });
  for (const channel of ["email", "sms"] as const) await ctx.store.insert("dunning_attempts", { gym_id: ctx.gym.id, transaction_id: txn.id, attempt, channel, outcome: "sent", created_at: ctx.now().toISOString() });
  return updated;
}
