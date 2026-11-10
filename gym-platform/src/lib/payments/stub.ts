import type { PaymentsProvider } from "./provider";

const id = (p: string) => `${p}_stub_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;

/**
 * Used when STRIPE_SECRET_KEY is missing. Behaves like Stripe test mode:
 * charges succeed unless the payment method id contains "decline".
 */
export const stubPayments: PaymentsProvider = {
  mode: "stub",
  async onboardingLink({ accountId, returnUrl }) {
    return { accountId: accountId ?? id("acct"), url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}stripe=stub_connected` };
  },
  async chargeSavedCard({ paymentMethodId }) {
    if (paymentMethodId?.includes("decline")) return { paymentIntentId: id("pi"), chargeId: null, status: "failed", failureReason: "card_declined: insufficient_funds" };
    return { paymentIntentId: id("pi"), chargeId: id("ch"), status: "succeeded" };
  },
  async createPaymentIntent() {
    const pi = id("pi");
    return { paymentIntentId: pi, chargeId: id("ch"), status: "succeeded", clientSecret: `${pi}_secret_stub` };
  },
  async transfer() {
    return { transferId: id("tr") };
  },
  async refund() {
    return { refundId: id("re") };
  },
  async reverseTransfer() {
    return { reversalId: id("trr") };
  },
  async cardUpdateLink({ returnUrl }) {
    return { url: `${returnUrl}?card=stub_updated` };
  },
};
