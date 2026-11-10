/**
 * Payments abstraction over Stripe Connect.
 *
 * Money flow ("separate charges and transfers"):
 *   1. Charge the client on the PLATFORM account (transfer_group = txn id).
 *   2. Transfer the gym's share to the gym's connected account and the coach's
 *      share to the coach's connected account (source_transaction = charge).
 *   3. The platform keeps only the transparent platform fee.
 * Refunds: refund the charge, then reverse each transfer proportionally.
 */
export interface ChargeResult {
  readonly paymentIntentId: string;
  readonly chargeId: string | null;
  readonly status: "succeeded" | "failed" | "requires_action";
  readonly clientSecret?: string;
  readonly failureReason?: string;
}

export interface PaymentsProvider {
  readonly mode: "stripe" | "stub";
  onboardingLink(args: { accountId: string | null; email: string | null; returnUrl: string; refreshUrl: string }): Promise<{ accountId: string; url: string }>;
  chargeSavedCard(args: { customerId: string | null; paymentMethodId: string | null; amountCents: number; currency: string; description: string; transferGroup: string; metadata: Record<string, string> }): Promise<ChargeResult>;
  createPaymentIntent(args: { amountCents: number; currency: string; email: string; description: string; transferGroup: string; metadata: Record<string, string> }): Promise<ChargeResult>;
  transfer(args: { amountCents: number; currency: string; destination: string; transferGroup: string; sourceCharge: string | null }): Promise<{ transferId: string }>;
  refund(args: { paymentIntentId: string; amountCents: number; reason: string }): Promise<{ refundId: string }>;
  reverseTransfer(args: { transferId: string; amountCents: number }): Promise<{ reversalId: string }>;
  cardUpdateLink(args: { customerId: string | null; returnUrl: string }): Promise<{ url: string }>;
}
