"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction } from "@/lib/ctx";
import { bookClass, cancelClassBooking, bookPrivate, cancelPrivate } from "@/lib/services/bookings";
import { purchaseProduct } from "@/lib/services/checkout";
import { refundTransaction } from "@/lib/services/refunds";
import { checkIn } from "@/lib/services/checkin";
import { promote, recordTestingResult } from "@/lib/services/ranks";
import { createLead, moveLead, requestReview, runDueAutomations, sendThreadMessage, threadFor } from "@/lib/services/comms";
import { retryFailedPayment } from "@/lib/services/dunning";
import { freezeMembership, matchCardMigration, posSale, saveMember } from "@/lib/services/people";
import { createApiKey, createWebhook, revokeApiKey, runImport } from "@/lib/services/data-io";
import { publishWaiverVersion } from "@/lib/services/waivers";
import { settingsSchema } from "@/lib/domain/settings";
import { audit } from "@/lib/services/context";
import type { ImportEntity, SourceSystem } from "@/lib/import/presets";
import type { LeadStage } from "@/lib/data/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(f.get(k) ?? 0);
const cents = (f: FormData, k: string) => Math.round(Number(String(f.get(k) ?? "0").replace(/[$,]/g, "")) * 100);
const back = (f: FormData, fallback: string) => s(f, "back") || fallback;

export async function refundAction(f: FormData) {
  await runAction("payments.refund", back(f, "/app/payments"), async (ctx) => {
    const amount = s(f, "amount") ? cents(f, "amount") : undefined;
    const r = await refundTransaction(ctx, { transactionId: s(f, "transactionId"), amountCents: amount, reason: s(f, "reason"), override: f.get("override") === "on", creditsAction: (s(f, "credits") || "auto") as "auto" });
    return `Refunded $${(r.amount_cents / 100).toFixed(2)}${r.credits_changed ? `, ${r.credits_changed} credit(s) ${r.credits_action === "restore" ? "restored" : "removed"}` : ""}. Splits reversed.`;
  });
}
export async function sellAction(f: FormData) {
  await runAction("payments.sell", back(f, "/app/payments"), async (ctx) => {
    const r = await purchaseProduct(ctx, { productId: s(f, "productId"), memberId: s(f, "memberId"), siblingIndex: n(f, "siblingIndex") });
    return r.transaction.status === "succeeded" ? `Charged $${(r.transaction.total_cents / 100).toFixed(2)}. Receipt ${r.transaction.receipt_number}.` : `Payment failed: ${r.transaction.failure_reason}`;
  });
}
export async function retryPaymentAction(f: FormData) {
  await runAction("payments.sell", back(f, "/app/payments"), async (ctx) => {
    const t = await retryFailedPayment(ctx, s(f, "transactionId"));
    return t.status === "succeeded" ? "Retry succeeded." : "Retry failed. Dunning message sent with card-update link.";
  });
}
export async function bookForMemberAction(f: FormData) {
  await runAction("bookings.manage", back(f, "/app/schedule"), async (ctx) => {
    const b = await bookClass(ctx, { sessionId: s(f, "sessionId"), memberId: s(f, "memberId"), trial: f.get("trial") === "on", source: "front_desk" });
    return b.status === "waitlisted" ? `Class full: added to waitlist (#${b.waitlist_position}).` : "Booked.";
  });
}
export async function cancelBookingAction(f: FormData) {
  await runAction("bookings.manage", back(f, "/app/schedule"), async (ctx) => {
    const fn = s(f, "kind") === "private" ? cancelPrivate : cancelClassBooking;
    const d = await fn(ctx, { bookingId: s(f, "bookingId"), override: f.get("override") === "on", reason: s(f, "reason") || undefined });
    return d.explanation + (d.feeCents ? ` Fee $${(d.feeCents / 100).toFixed(2)} charged.` : "");
  });
}
export async function bookPrivateStaffAction(f: FormData) {
  await runAction("coach.self", back(f, "/app/coach"), async (ctx) => {
    await bookPrivate(ctx, { coachId: s(f, "coachId"), lessonTypeId: s(f, "lessonTypeId"), startsAt: s(f, "startsAt"), memberIds: f.getAll("memberId").map(String).filter(Boolean) });
    return "Private lesson booked.";
  });
}
export async function staffCheckInAction(f: FormData) {
  await runAction("checkin.kiosk", back(f, "/kiosk"), async (ctx) => {
    const r = await checkIn(ctx, { memberId: s(f, "memberId"), method: (s(f, "method") || "staff") as "kiosk" });
    return `✓ ${r.member.first_name} checked in${r.className ? ` to ${r.className}` : ""}.${r.warnings.length ? ` ⚠ ${r.warnings.join(" · ")}` : ""}`;
  });
}
export async function promoteAction(f: FormData) {
  await runAction("ranks.promote", back(f, "/app/ranks"), async (ctx, sess) => {
    await promote(ctx, { memberId: s(f, "memberId"), systemId: s(f, "systemId"), kind: s(f, "kind") as "stripe", coachId: sess.coachId });
    return s(f, "kind") === "stripe" ? "Stripe awarded." : "Promoted! Certificate ready.";
  });
}
export async function testingResultAction(f: FormData) {
  await runAction("ranks.promote", back(f, "/app/ranks"), async (ctx) => {
    await recordTestingResult(ctx, { registrationId: s(f, "registrationId"), result: s(f, "result") as "pass" });
    return "Result recorded.";
  });
}
export async function saveMemberAction(f: FormData) {
  let id = s(f, "id");
  await runAction("members.edit", back(f, "/app/members"), async (ctx) => {
    const m = await saveMember(ctx, { id: id || undefined, firstName: s(f, "firstName"), lastName: s(f, "lastName"), email: s(f, "email"), phone: s(f, "phone"), dateOfBirth: s(f, "dateOfBirth"), status: (s(f, "status") || "active") as "active", notes: s(f, "notes") || undefined, pickupNotes: s(f, "pickupNotes") || undefined, medicalNotes: s(f, "medicalNotes") || undefined });
    id = m.id;
    return "Member saved.";
  });
}
export async function freezeAction(f: FormData) {
  await runAction("members.edit", back(f, "/app/members"), async (ctx) => {
    await freezeMembership(ctx, { membershipId: s(f, "membershipId"), startsOn: s(f, "startsOn"), endsOn: s(f, "endsOn"), reason: s(f, "reason") });
    return "Membership on hold. Billing date pushed back.";
  });
}
export async function sendMessageAction(f: FormData) {
  await runAction("messages.view", back(f, "/app/messages"), async (ctx, sess) => {
    let threadId = s(f, "threadId");
    if (!threadId && s(f, "memberId")) threadId = (await threadFor(ctx, { memberId: s(f, "memberId"), coachId: sess.role === "independent_coach" ? sess.coachId : null })).id;
    await sendThreadMessage(ctx, { threadId, body: s(f, "body") });
    return "Sent.";
  });
}
export async function leadAction(f: FormData) {
  await runAction("leads.manage", back(f, "/app/messages?tab=leads"), async (ctx) => {
    if (s(f, "leadId")) { await moveLead(ctx, { leadId: s(f, "leadId"), stage: s(f, "stage") as LeadStage }); return "Lead updated."; }
    await createLead(ctx, { firstName: s(f, "firstName"), lastName: s(f, "lastName"), email: s(f, "email"), phone: s(f, "phone"), interest: s(f, "interest"), source: "manual" });
    return "Lead added. Follow-up sequence started.";
  });
}
export async function automationToggleAction(f: FormData) {
  await runAction("settings.manage", back(f, "/app/messages?tab=automations"), async (ctx) => {
    const a = await ctx.store.update("automations", s(f, "id"), { is_active: f.get("active") === "true" });
    return `${a.name} ${a.is_active ? "enabled" : "paused"}.`;
  });
}
export async function runAutomationsAction(f: FormData) {
  await runAction("settings.manage", back(f, "/app/messages?tab=automations"), async (ctx) => `Ran ${await runDueAutomations(ctx)} due step(s).`);
}
export async function reviewAction(f: FormData) {
  await runAction("members.edit", back(f, "/app/members"), async (ctx) => { await requestReview(ctx, s(f, "memberId")); return "Review request sent."; });
}
export async function posAction(f: FormData) {
  await runAction("pos.sell", "/app/pos", async (ctx) => {
    const lines = f.getAll("itemId").map((id, i) => ({ itemId: String(id), qty: Number(f.getAll("qty")[i] ?? 0) })).filter((l) => l.qty > 0);
    const t = await posSale(ctx, { memberId: s(f, "memberId") || null, lines });
    return t.status === "succeeded" ? `Sale complete: $${(t.total_cents / 100).toFixed(2)} (${t.receipt_number}).` : `Card declined: ${t.failure_reason}`;
  });
}
export async function restockAction(f: FormData) {
  await runAction("pos.sell", "/app/pos?tab=inventory", async (ctx) => {
    const item = await ctx.store.get("inventory_items", s(f, "itemId"));
    if (!item) throw new Error("not found");
    await ctx.store.update("inventory_items", item.id, { stock: item.stock + z.number().int().min(1).max(1000).parse(n(f, "qty")) });
    return "Stock updated.";
  });
}
export async function importAction(f: FormData) {
  await runAction("import.run", "/app/import", async (ctx) => {
    const file = f.get("file");
    const text = file instanceof File && file.size > 0 ? await file.text() : s(f, "csv");
    if (text.length > 5_000_000) throw new Error("File too large (5 MB max)");
    const mapping = Object.fromEntries([...f.entries()].filter(([k, v]) => k.startsWith("map_") && v).map(([k, v]) => [k.slice(4), String(v)]));
    const job = await runImport(ctx, { text, entity: s(f, "entity") as ImportEntity, system: s(f, "system") as SourceSystem, mapping, fileName: file instanceof File ? file.name : undefined });
    return `Imported ${job.imported_count} of ${job.row_count} rows${job.error_count ? ` (${job.error_count} need fixing)` : ""}.`;
  });
}
export async function matchCardsAction(f: FormData) {
  await runAction("import.run", "/app/import?tab=cards", async (ctx) => { const r = await matchCardMigration(ctx, s(f, "migrationId")); return `${r.attached} cards attached, ${r.unmatched} still unmatched.`; });
}
export async function settingsAction(f: FormData) {
  await runAction("settings.manage", back(f, "/app/settings"), async (ctx) => {
    const cur = ctx.gym.settings;
    const next = settingsSchema.parse({
      ...cur,
      cancellation: { window_hours: n(f, "window_hours"), late_cancel_fee_cents: cents(f, "late_fee"), no_show_fee_cents: cents(f, "no_show_fee"), late_cancel_consumes_credit: f.get("consumes") === "on" },
      refunds: { package_refund_mode: s(f, "refund_mode"), membership_refund_days: n(f, "membership_refund_days"), allow_staff_override: f.get("allow_override") === "on" },
      reminders: { ...cur.reminders, class_hours_before: s(f, "class_hours").split(",").map(Number).filter((x) => x > 0), private_hours_before: s(f, "private_hours").split(",").map(Number).filter((x) => x > 0) },
      retention: { inactive_days: n(f, "inactive_days"), package_low_credits: n(f, "low_credits"), membership_expiring_days: n(f, "expiring_days") },
      booking: { open_days_ahead: n(f, "open_days"), waitlist_auto_promote: f.get("auto_promote") === "on", require_waiver: f.get("require_waiver") === "on" },
      packages: { default_expiration_days: n(f, "expiration_days") },
      fee_paid_by: s(f, "fee_paid_by") || "business",
    });
    await ctx.store.update("gyms", ctx.gym.id, { settings: next, name: s(f, "name") || ctx.gym.name, google_review_url: s(f, "review_url") || null, brand_color: /^#[0-9a-f]{6}$/i.test(s(f, "brand_color")) ? s(f, "brand_color") : ctx.gym.brand_color });
    await audit(ctx, "policy.updated", "gyms", ctx.gym.id, { cancellation: next.cancellation, refunds: next.refunds });
    return "Settings saved.";
  });
}
export async function coachTermsAction(f: FormData) {
  await runAction("settings.manage", "/app/settings?tab=coaches", async (ctx) => {
    const split = z.number().int().min(0).max(100).parse(n(f, "split"));
    await ctx.store.update("coaches", s(f, "coachId"), { default_coach_split_bps: split * 100, rent_model: z.enum(["none", "flat_monthly", "per_hour", "per_session"]).parse(s(f, "rent_model")), rent_amount_cents: cents(f, "rent_amount"), employment: s(f, "employment") === "independent" ? "independent" : "staff" });
    await audit(ctx, "coach.terms_updated", "coaches", s(f, "coachId"), { split_pct: split, rent_model: s(f, "rent_model") });
    return "Coach terms saved.";
  });
}
export async function waiverVersionAction(f: FormData) {
  await runAction("settings.manage", "/app/settings?tab=waivers", async (ctx) => { const t = await publishWaiverVersion(ctx, { templateId: s(f, "templateId"), body: s(f, "body") }); return `Published v${t.version}. Members will be asked to re-sign.`; });
}
export async function apiKeyAction(f: FormData) {
  if (s(f, "revoke")) return runAction("developers.manage", "/app/developers", async (ctx) => { await revokeApiKey(ctx, s(f, "revoke")); return "Key revoked."; });
  let raw = "";
  await runAction("developers.manage", "/app/developers", async (ctx) => {
    raw = (await createApiKey(ctx, { name: s(f, "name"), scopes: f.getAll("scope").map(String) as ("read" | "write")[] })).raw;
    return `New key (copy it now, it won't be shown again): ${raw}`;
  });
}
export async function webhookAction(f: FormData) {
  await runAction("developers.manage", "/app/developers", async (ctx) => { await createWebhook(ctx, { url: s(f, "url"), events: f.getAll("event").map(String) }); return "Webhook endpoint added."; });
}
export async function switchDemoRole(f: FormData) {
  const role = s(f, "role");
  (await cookies()).set("gp_demo_role", role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  const { homeFor } = await import("@/lib/auth/roles");
  redirect(homeFor(role as never));
}
export async function signOut() {
  (await cookies()).delete("gp_demo_role");
  redirect("/login");
}
