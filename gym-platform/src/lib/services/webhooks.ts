import { createHmac } from "node:crypto";
import { log } from "@/lib/log";
import type { Ctx } from "./context";

export const WEBHOOK_EVENTS = [
  "booking.created", "booking.cancelled", "payment.succeeded", "payment.failed", "payment.refunded", "checkin.created", "member.created", "lead.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Fire-and-record outgoing webhooks. Header `X-Signature: t=<ts>,v1=<hmac>`
 * where hmac = HMAC-SHA256(endpoint secret, "<ts>.<body>"). In demo mode
 * deliveries are recorded but not sent.
 */
export async function emitWebhook(ctx: Ctx, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const endpoints = await ctx.store.list("webhook_endpoints", { where: { gym_id: ctx.gym.id, is_active: true } });
  for (const ep of endpoints.filter((e) => e.events.includes(event))) {
    const payload = { id: crypto.randomUUID(), type: event, created: ctx.now().toISOString(), gym_id: ctx.gym.id, data };
    const body = JSON.stringify(payload);
    let status: number | null = null;
    if (ctx.store.kind === "supabase") {
      const ts = Math.floor(ctx.now().getTime() / 1000);
      try {
        const res = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": `t=${ts},v1=${signPayload(ep.secret, ts, body)}` }, body, signal: AbortSignal.timeout(5000) });
        status = res.status;
      } catch (e) {
        log.warn("webhook.delivery_failed", { endpoint: ep.id, event, error: e instanceof Error ? e.message : "unknown" });
      }
    }
    await ctx.store.insert("webhook_deliveries", { gym_id: ctx.gym.id, endpoint_id: ep.id, event, payload, status_code: status ?? (ctx.store.kind === "memory" ? 200 : null), attempt: 1, delivered_at: status && status < 300 ? ctx.now().toISOString() : ctx.store.kind === "memory" ? ctx.now().toISOString() : null, created_at: ctx.now().toISOString() });
  }
}
