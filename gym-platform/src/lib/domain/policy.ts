import { z } from "zod";

export const cancellationPolicySchema = z.object({
  window_hours: z.number().int().min(0).max(168),
  late_cancel_fee_cents: z.number().int().min(0),
  no_show_fee_cents: z.number().int().min(0),
  late_cancel_consumes_credit: z.boolean(),
});
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

export const refundModes = ["unused_prorated", "full_if_unused", "none"] as const;
export type PackageRefundMode = (typeof refundModes)[number];

export interface CancellationDecision {
  readonly kind: "free" | "late" | "no_show";
  readonly feeCents: number;
  readonly restoreCredit: boolean;
  readonly overridden: boolean;
  readonly explanation: string;
}

/** Applies the gym's cancellation policy. `override` = staff waiver (audited). */
export function evaluateCancellation(args: {
  startsAt: Date;
  now: Date;
  policy: CancellationPolicy;
  override?: boolean;
}): CancellationDecision {
  const { startsAt, now, policy, override } = args;
  if (override) {
    return { kind: "free", feeCents: 0, restoreCredit: true, overridden: true, explanation: "Fee waived by staff override." };
  }
  const hoursUntil = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil <= 0) {
    return {
      kind: "no_show", feeCents: policy.no_show_fee_cents, restoreCredit: false, overridden: false,
      explanation: "Session already started: treated as a no-show.",
    };
  }
  if (hoursUntil < policy.window_hours) {
    return {
      kind: "late",
      feeCents: policy.late_cancel_fee_cents,
      restoreCredit: !policy.late_cancel_consumes_credit,
      overridden: false,
      explanation: `Cancelled within ${policy.window_hours}h of start: late-cancel policy applies.`,
    };
  }
  return { kind: "free", feeCents: 0, restoreCredit: true, overridden: false, explanation: "Cancelled within policy. Credit restored." };
}

/** What a package refund should be under the gym's rule. */
export function quotePackageRefund(
  ent: { creditsTotal: number; creditsUsed: number; amountPaidCents: number; refundedCents: number },
  mode: PackageRefundMode,
): { amountCents: number; creditsToRemove: number } {
  const unused = ent.creditsTotal - ent.creditsUsed;
  const remainingPaid = ent.amountPaidCents - ent.refundedCents;
  if (mode === "none" || unused <= 0) return { amountCents: 0, creditsToRemove: 0 };
  if (mode === "full_if_unused") {
    return ent.creditsUsed === 0 ? { amountCents: remainingPaid, creditsToRemove: unused } : { amountCents: 0, creditsToRemove: 0 };
  }
  const prorated = Math.floor((ent.amountPaidCents * unused) / ent.creditsTotal);
  // Earlier partial refunds already returned part of the unused value.
  return { amountCents: Math.max(0, Math.min(prorated - ent.refundedCents, remainingPaid)), creditsToRemove: unused };
}

/** Credits to remove for a given refund amount (proportional, rounded up). */
export function creditsForRefund(
  ent: { creditsTotal: number; creditsUsed: number; amountPaidCents: number },
  refundCents: number,
): number {
  const unused = ent.creditsTotal - ent.creditsUsed;
  if (ent.amountPaidCents === 0) return unused;
  const perCredit = ent.amountPaidCents / ent.creditsTotal;
  return Math.min(unused, Math.ceil(refundCents / perCredit - 1e-9));
}
