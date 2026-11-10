import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { stripeClient } from "@/lib/payments/stripe";
import { serviceStore } from "@/lib/data";
import { log } from "@/lib/log";

/**
 * Stripe webhook: verifies the signature, then reconciles state.
 *  - account.updated → gym/coach payouts enabled
 *  - payment_intent.payment_failed → mark transaction failed (dunning picks it up)
 *  - charge.refunded (refunds made in the Stripe dashboard) → logged for review
 */
export async function POST(req: NextRequest) {
  const stripe = stripeClient();
  if (!stripe || !env.stripeWebhookSecret) return NextResponse.json({ success: false, error: "Stripe not configured" }, { status: 501 });
  const sig = req.headers.get("stripe-signature") ?? "";
  let event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ success: false, error: "Bad signature" }, { status: 400 });
  }
  const store = await serviceStore();
  switch (event.type) {
    case "account.updated": {
      const a = event.data.object;
      const gym = await store.first("gyms", { where: { stripe_account_id: a.id } });
      if (gym) await store.update("gyms", gym.id, { stripe_charges_enabled: a.charges_enabled, stripe_payouts_enabled: a.payouts_enabled });
      const coach = await store.first("coaches", { where: { stripe_account_id: a.id } });
      if (coach) await store.update("coaches", coach.id, { stripe_payouts_enabled: a.payouts_enabled });
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const t = await store.first("transactions", { where: { stripe_payment_intent_id: pi.id } });
      if (t && t.status !== "failed") await store.update("transactions", t.id, { status: "failed", failure_reason: pi.last_payment_error?.message ?? "failed" });
      break;
    }
    default:
      log.info("stripe.webhook_ignored", { type: event.type });
  }
  return NextResponse.json({ received: true });
}
