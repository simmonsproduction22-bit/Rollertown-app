import "server-only";
import Stripe from "stripe";
import { env, stripeEnabled } from "@/lib/env";
import type { PaymentsProvider } from "./provider";
import { stubPayments } from "./stub";

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) client = new Stripe(env.stripeSecretKey);
  return client;
}

export const stripePayments: PaymentsProvider = {
  mode: "stripe",
  async onboardingLink({ accountId, email, returnUrl, refreshUrl }) {
    const acct = accountId ?? (await stripe().accounts.create({
      type: "express", email: email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    })).id;
    const link = await stripe().accountLinks.create({ account: acct, type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl });
    return { accountId: acct, url: link.url };
  },
  async chargeSavedCard({ customerId, paymentMethodId, amountCents, currency, description, transferGroup, metadata }) {
    if (!customerId || !paymentMethodId) return { paymentIntentId: "", chargeId: null, status: "failed", failureReason: "No card on file" };
    try {
      const pi = await stripe().paymentIntents.create({
        amount: amountCents, currency, customer: customerId, payment_method: paymentMethodId, off_session: true, confirm: true,
        description, transfer_group: transferGroup, metadata,
      });
      return { paymentIntentId: pi.id, chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null, status: pi.status === "succeeded" ? "succeeded" : "requires_action" };
    } catch (e) {
      const err = e as Stripe.errors.StripeError;
      return { paymentIntentId: (err.payment_intent as { id?: string } | undefined)?.id ?? "", chargeId: null, status: "failed", failureReason: `${err.code ?? "error"}: ${err.decline_code ?? err.message}` };
    }
  },
  async createPaymentIntent({ amountCents, currency, email, description, transferGroup, metadata }) {
    const pi = await stripe().paymentIntents.create({
      amount: amountCents, currency, receipt_email: email, description, transfer_group: transferGroup, metadata,
      automatic_payment_methods: { enabled: true }, setup_future_usage: "off_session",
    });
    return { paymentIntentId: pi.id, chargeId: null, status: "requires_action", clientSecret: pi.client_secret ?? undefined };
  },
  async transfer({ amountCents, currency, destination, transferGroup, sourceCharge }) {
    const t = await stripe().transfers.create({ amount: amountCents, currency, destination, transfer_group: transferGroup, ...(sourceCharge ? { source_transaction: sourceCharge } : {}) });
    return { transferId: t.id };
  },
  async refund({ paymentIntentId, amountCents, reason }) {
    const r = await stripe().refunds.create({ payment_intent: paymentIntentId, amount: amountCents, metadata: { reason } });
    return { refundId: r.id };
  },
  async reverseTransfer({ transferId, amountCents }) {
    const r = await stripe().transfers.createReversal(transferId, { amount: amountCents });
    return { reversalId: r.id };
  },
  async cardUpdateLink({ customerId, returnUrl }) {
    if (!customerId) return { url: returnUrl };
    const s = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: s.url };
  },
};

export function payments(): PaymentsProvider {
  return stripeEnabled() ? stripePayments : stubPayments;
}

export function stripeClient(): Stripe | null {
  return stripeEnabled() ? stripe() : null;
}
