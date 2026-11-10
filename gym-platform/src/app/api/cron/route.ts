import { NextResponse, type NextRequest } from "next/server";
import { serviceStore } from "@/lib/data";
import { payments } from "@/lib/payments/stripe";
import { loadGym, type Ctx } from "@/lib/services/context";
import { runDueAutomations } from "@/lib/services/comms";
import { retryFailedPayment } from "@/lib/services/dunning";
import { sendSms } from "@/lib/messaging/sms";
import { emailProvider } from "@/lib/messaging/email";
import { materializeSessions } from "@/lib/services/onboarding";

/**
 * Run every 15 minutes (Vercel Cron / Supabase pg_cron → HTTP). Protected by
 * `Authorization: Bearer $CRON_SECRET`. Sends due reminders, automation steps,
 * retries failed payments per the dunning schedule, and keeps recurring
 * classes materialized through the booking window.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const store = await serviceStore();
  const now = new Date();
  const summary: Record<string, number> = { reminders: 0, automations: 0, retries: 0, sessions: 0 };
  for (const g of await store.list("gyms")) {
    const ctx: Ctx = { store, gym: await loadGym(store, g.id), actor: { userId: null, label: "cron", role: "system" }, payments: payments(), now: () => now };
    for (const o of (await store.list("notifications_outbox", { where: { gym_id: g.id, status: "queued" } })).filter((x) => x.send_after <= now.toISOString())) {
      const r = o.channel === "sms" ? await sendSms(o.to_address, o.body) : await emailProvider().send({ to: o.to_address, subject: o.subject ?? g.name, text: o.body });
      await store.update("notifications_outbox", o.id, { status: r.status === "failed" ? "failed" : "sent", sent_at: now.toISOString(), error: r.error ?? null });
      summary.reminders++;
    }
    summary.automations += await runDueAutomations(ctx);
    summary.sessions += await materializeSessions(ctx);
    for (const t of (await store.list("transactions", { where: { gym_id: g.id, status: "failed" } })).filter((x) => x.next_retry_at && x.next_retry_at <= now.toISOString())) {
      await retryFailedPayment(ctx, t.id);
      summary.retries++;
    }
  }
  return NextResponse.json({ success: true, data: summary });
}
