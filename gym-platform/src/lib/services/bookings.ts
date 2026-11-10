import { z } from "zod";
import { computeSlots } from "@/lib/domain/availability";
import { evaluateCancellation } from "@/lib/domain/policy";
import type { ClassBooking, Entitlement, Member, PrivateBooking } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";
import { chargeAndSplit } from "./checkout";
import { notifyMember, queueReminders } from "./notify";
import { waiverStatus } from "./waivers";
import { emitWebhook } from "./webhooks";
import { refundTransaction } from "./refunds";

const ACTIVE: ClassBooking["status"][] = ["booked", "attended"];

/** Best credit source for a class: active membership first, then soonest-expiring class pack. */
export async function findClassEntitlement(ctx: Ctx, memberId: string): Promise<{ membershipId: string | null; entitlement: Entitlement | null }> {
  const ms = await ctx.store.first("memberships", { where: { member_id: memberId, status: "active" } });
  if (ms) return { membershipId: ms.id, entitlement: null };
  const now = ctx.now().toISOString();
  const packs = (await ctx.store.list("entitlements", { where: { member_id: memberId, kind: "class", status: "active" } }))
    .filter((e) => e.credits_used < e.credits_total && (!e.expires_at || e.expires_at > now))
    .sort((a, b) => (a.expires_at ?? "9") < (b.expires_at ?? "9") ? -1 : 1);
  return { membershipId: null, entitlement: packs[0] ?? null };
}

async function useCredit(ctx: Ctx, ent: Entitlement, refId: string, delta = 1, reason = "booking"): Promise<void> {
  const used = ent.credits_used + delta;
  await ctx.store.update("entitlements", ent.id, { credits_used: used, status: used >= ent.credits_total ? "exhausted" : "active" });
  await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: ent.id, delta: -delta, reason, ref_id: refId, created_at: ctx.now().toISOString() });
}

async function returnCredit(ctx: Ctx, entId: string, refId: string): Promise<void> {
  const ent = await ctx.store.get("entitlements", entId);
  if (!ent || ent.credits_used === 0) return;
  await ctx.store.update("entitlements", ent.id, { credits_used: ent.credits_used - 1, status: "active" });
  await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: ent.id, delta: 1, reason: "cancel_restore", ref_id: refId, created_at: ctx.now().toISOString() });
}

export const bookClassSchema = z.object({ sessionId: z.string().uuid(), memberId: z.string().uuid(), trial: z.boolean().default(false), source: z.string().max(30).default("app") });

export async function bookClass(ctx: Ctx, input: z.input<typeof bookClassSchema>): Promise<ClassBooking> {
  const args = bookClassSchema.parse(input);
  const session = await mustGet(ctx, "class_sessions", args.sessionId);
  const member = await mustGet(ctx, "members", args.memberId);
  const type = await mustGet(ctx, "class_types", session.class_type_id);
  if (session.is_cancelled) throw new AppError("This class was cancelled.");
  if (new Date(session.starts_at) < ctx.now()) throw new AppError("This class has already started.");
  const daysAhead = (new Date(session.starts_at).getTime() - ctx.now().getTime()) / 86_400_000;
  if (daysAhead > ctx.gym.settings.booking.open_days_ahead) throw new AppError(`Booking opens ${ctx.gym.settings.booking.open_days_ahead} days before class.`);
  if (ctx.gym.settings.booking.require_waiver && !(await waiverStatus(ctx, member.id)).ok) throw new AppError("Please sign the current waiver before booking.", 409, "WAIVER_REQUIRED");
  if (["frozen", "cancelled"].includes(member.status)) throw new AppError(`Membership is ${member.status}. Talk to the front desk to reactivate.`);
  const existing = await ctx.store.first("class_bookings", { where: { session_id: session.id, member_id: member.id } });
  if (existing && !["cancelled", "late_cancelled"].includes(existing.status)) throw new AppError("Already booked.");

  let membershipId: string | null = null;
  let entitlement: Entitlement | null = null;
  if (!args.trial) {
    ({ membershipId, entitlement } = await findClassEntitlement(ctx, member.id));
    if (!membershipId && !entitlement) throw new AppError("No active membership or class credits. Buy a pack or drop-in first.", 402, "NO_CREDITS");
  } else {
    if (!type.allow_trial) throw new AppError("Trials aren't available for this class.");
    const priorTrials = await ctx.store.count("class_bookings", { where: { member_id: member.id, is_trial: true } });
    if (priorTrials > 0) throw new AppError("Free trial already used.");
  }

  const taken = (await ctx.store.list("class_bookings", { where: { session_id: session.id } })).filter((b) => ACTIVE.includes(b.status));
  const waitlist = (await ctx.store.list("class_bookings", { where: { session_id: session.id, status: "waitlisted" } }));
  const full = taken.length >= session.capacity;
  const row = {
    gym_id: ctx.gym.id, session_id: session.id, member_id: member.id, status: (full ? "waitlisted" : "booked") as ClassBooking["status"],
    waitlist_position: full ? waitlist.length + 1 : null, is_trial: args.trial, is_drop_in: false,
    entitlement_id: full ? null : entitlement?.id ?? null, membership_id: membershipId, source: args.source, cancelled_at: null, fee_cents: 0,
  };
  const booking = existing ? await ctx.store.update("class_bookings", existing.id, row) : await ctx.store.insert("class_bookings", { ...row, created_at: ctx.now().toISOString() });
  if (!full && entitlement) await useCredit(ctx, entitlement, booking.id);
  if (!full) {
    await queueReminders(ctx, member, { refId: booking.id, startsAt: new Date(session.starts_at), label: type.name, kind: "class" });
    await emitWebhook(ctx, "booking.created", { booking_id: booking.id, type: "class", session_id: session.id, member_id: member.id });
  }
  return booking;
}

export const cancelSchema = z.object({ bookingId: z.string().uuid(), override: z.boolean().default(false), reason: z.string().max(200).optional() });

/** Cancel within policy. Late cancels charge the fee; waitlist auto-promotes. */
export async function cancelClassBooking(ctx: Ctx, input: z.input<typeof cancelSchema>) {
  const args = cancelSchema.parse(input);
  const booking = await mustGet(ctx, "class_bookings", args.bookingId);
  if (!["booked", "waitlisted"].includes(booking.status)) throw new AppError("This booking can't be cancelled.");
  const session = await mustGet(ctx, "class_sessions", booking.session_id);
  if (booking.status === "waitlisted") {
    await ctx.store.update("class_bookings", booking.id, { status: "cancelled", cancelled_at: ctx.now().toISOString(), waitlist_position: null });
    return { kind: "free" as const, feeCents: 0, explanation: "Removed from waitlist." };
  }
  const decision = evaluateCancellation({ startsAt: new Date(session.starts_at), now: ctx.now(), policy: ctx.gym.settings.cancellation, override: args.override });
  const member = await mustGet(ctx, "members", booking.member_id);
  await ctx.store.update("class_bookings", booking.id, { status: decision.kind === "free" ? "cancelled" : "late_cancelled", cancelled_at: ctx.now().toISOString(), fee_cents: decision.feeCents });
  if (decision.restoreCredit && booking.entitlement_id) await returnCredit(ctx, booking.entitlement_id, booking.id);
  if (decision.feeCents > 0 && !booking.is_trial) {
    await chargeAndSplit(ctx, { member, coach: null, product: null, totalCents: decision.feeCents, description: "Late-cancel fee", items: [{ name: "Late-cancel fee", quantity: 1, unit_price_cents: decision.feeCents }] });
  }
  if (args.override) await audit(ctx, "late_cancel.override", "class_bookings", booking.id, { reason: args.reason ?? "", member: `${member.first_name} ${member.last_name}` });
  await promoteWaitlist(ctx, session.id);
  await emitWebhook(ctx, "booking.cancelled", { booking_id: booking.id, type: "class", late: decision.kind !== "free" });
  return decision;
}

export async function promoteWaitlist(ctx: Ctx, sessionId: string): Promise<ClassBooking | null> {
  if (!ctx.gym.settings.booking.waitlist_auto_promote) return null;
  const session = await mustGet(ctx, "class_sessions", sessionId);
  const all = await ctx.store.list("class_bookings", { where: { session_id: sessionId } });
  if (all.filter((b) => ACTIVE.includes(b.status)).length >= session.capacity) return null;
  const next = all.filter((b) => b.status === "waitlisted").sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))[0];
  if (!next) return null;
  const { entitlement } = await findClassEntitlement(ctx, next.member_id);
  const promoted = await ctx.store.update("class_bookings", next.id, { status: "booked", waitlist_position: null, entitlement_id: entitlement?.id ?? null });
  if (entitlement) await useCredit(ctx, entitlement, promoted.id);
  const member = await mustGet(ctx, "members", next.member_id);
  const type = await mustGet(ctx, "class_types", session.class_type_id);
  await notifyMember(ctx, member, { category: "reminder", sms: `Good news ${member.first_name}: a spot opened in ${type.name}. You're in!`, subject: "You're off the waitlist", refId: promoted.id });
  return promoted;
}

// ---------------------------------------------------------------------------
// Private lessons
// ---------------------------------------------------------------------------
export async function privateSlots(ctx: Ctx, args: { coachId: string; lessonTypeId: string; date: string }) {
  const coach = await mustGet(ctx, "coaches", args.coachId);
  const lt = await mustGet(ctx, "lesson_types", args.lessonTypeId);
  const windows = (await ctx.store.list("coach_availability", { where: { coach_id: coach.id } })).map((w) => ({ weekday: w.weekday, startTime: w.start_time.slice(0, 5), endTime: w.end_time.slice(0, 5) }));
  const dayStart = new Date(`${args.date}T00:00:00Z`).getTime() - 86_400_000;
  const dayEnd = dayStart + 3 * 86_400_000;
  const inDay = (s: string) => new Date(s).getTime() >= dayStart && new Date(s).getTime() <= dayEnd;
  const privates = (await ctx.store.list("private_bookings", { where: { coach_id: coach.id, status: { in: ["confirmed", "pending_payment"] } } })).filter((b) => inDay(b.starts_at));
  const types = new Map((await ctx.store.list("lesson_types", { where: { gym_id: ctx.gym.id } })).map((t) => [t.id, t]));
  const classes = (await ctx.store.list("class_sessions", { where: { coach_id: coach.id, is_cancelled: false } })).filter((s) => inDay(s.starts_at));
  const timeOff = await ctx.store.list("coach_time_off", { where: { coach_id: coach.id } });
  const busy = [
    ...privates.map((b) => ({ start: new Date(new Date(b.starts_at).getTime() - (types.get(b.lesson_type_id)?.buffer_before_min ?? 0) * 60_000), end: new Date(new Date(b.ends_at).getTime() + (types.get(b.lesson_type_id)?.buffer_after_min ?? 0) * 60_000) })),
    ...classes.map((s) => ({ start: new Date(s.starts_at), end: new Date(s.ends_at) })),
    ...timeOff.map((t) => ({ start: new Date(t.starts_at), end: new Date(t.ends_at) })),
  ];
  return computeSlots({ date: args.date, tz: ctx.gym.timezone, windows, busy, durationMin: lt.duration_min, bufferBeforeMin: lt.buffer_before_min, bufferAfterMin: lt.buffer_after_min, stepMin: 15, now: new Date(ctx.now().getTime() + 2 * 3_600_000) });
}

export const bookPrivateSchema = z.object({
  coachId: z.string().uuid(), lessonTypeId: z.string().uuid(), startsAt: z.string().datetime(),
  memberIds: z.array(z.string().uuid()).min(1).max(8), notes: z.string().max(500).optional(), pay: z.enum(["credits", "card"]).default("credits"),
});

export async function bookPrivate(ctx: Ctx, input: z.input<typeof bookPrivateSchema>): Promise<PrivateBooking> {
  const args = bookPrivateSchema.parse(input);
  const coach = await mustGet(ctx, "coaches", args.coachId);
  const lt = await mustGet(ctx, "lesson_types", args.lessonTypeId);
  if (lt.coach_id && lt.coach_id !== coach.id) throw new AppError("That lesson type belongs to another coach.");
  if (args.memberIds.length > lt.max_participants) throw new AppError(`${lt.name} allows up to ${lt.max_participants} people.`);
  const start = new Date(args.startsAt);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.gym.timezone }).format(start);
  const slots = await privateSlots(ctx, { coachId: coach.id, lessonTypeId: lt.id, date });
  if (!slots.some((s) => s.start.getTime() === start.getTime())) throw new AppError("That time is no longer available. Pick another slot.", 409, "SLOT_TAKEN");
  const members: Member[] = [];
  for (const id of args.memberIds) members.push(await mustGet(ctx, "members", id));

  const rooms = (await ctx.store.list("rooms", { where: { gym_id: ctx.gym.id } })).filter((r) => lt.room_kinds.includes(r.kind));
  const end = new Date(start.getTime() + lt.duration_min * 60_000);
  const roomBusy = await ctx.store.list("private_bookings", { where: { status: "confirmed" } });
  const room = rooms.find((r) => !roomBusy.some((b) => b.room_id === r.id && new Date(b.starts_at) < end && start < new Date(b.ends_at))) ?? null;

  const booking = await ctx.store.insert("private_bookings", {
    gym_id: ctx.gym.id, coach_id: coach.id, lesson_type_id: lt.id, room_id: room?.id ?? null, starts_at: start.toISOString(), ends_at: end.toISOString(),
    status: "confirmed", notes: args.notes ?? null, created_at: ctx.now().toISOString(),
  });
  const perPerson = lt.max_participants > 1 ? lt.per_person_price_cents ?? Math.round(lt.price_cents / args.memberIds.length) : lt.price_cents;
  for (const m of members) {
    let entId: string | null = null;
    if (args.pay === "credits") {
      const ent = (await ctx.store.list("entitlements", { where: { member_id: m.id, kind: "lesson", status: "active" } }))
        .find((e) => (!e.coach_id || e.coach_id === coach.id) && e.credits_used < e.credits_total && (!e.expires_at || e.expires_at > ctx.now().toISOString()));
      if (ent) { await useCredit(ctx, ent, booking.id); entId = ent.id; }
    }
    if (!entId) {
      const txn = await chargeAndSplit(ctx, { member: m, coach, product: null, totalCents: perPerson, description: `${lt.name} with ${coach.display_name}`, items: [{ name: lt.name, quantity: 1, unit_price_cents: perPerson }], perSessionRentCents: coach.rent_model === "per_session" ? coach.rent_amount_cents : 0 });
      if (txn.status !== "succeeded") {
        await ctx.store.update("private_bookings", booking.id, { status: "cancelled", cancelled_at: ctx.now().toISOString() });
        throw new AppError(`Payment failed for ${m.first_name}: ${txn.failure_reason ?? "card declined"}`, 402, "PAYMENT_FAILED");
      }
      await ctx.store.update("private_bookings", booking.id, { transaction_id: txn.id });
    } else if (args.memberIds.length === 1) {
      await ctx.store.update("private_bookings", booking.id, { entitlement_id: entId });
    }
    await ctx.store.insert("private_booking_participants", { gym_id: ctx.gym.id, booking_id: booking.id, member_id: m.id, price_cents: entId ? 0 : perPerson });
    await queueReminders(ctx, m, { refId: booking.id, startsAt: start, label: `${lt.name} with ${coach.display_name}`, kind: "private" });
  }
  await emitWebhook(ctx, "booking.created", { booking_id: booking.id, type: "private", coach_id: coach.id });
  return (await ctx.store.get("private_bookings", booking.id))!;
}

export async function cancelPrivate(ctx: Ctx, input: z.input<typeof cancelSchema>) {
  const args = cancelSchema.parse(input);
  const b = await mustGet(ctx, "private_bookings", args.bookingId);
  if (b.status !== "confirmed") throw new AppError("This lesson can't be cancelled.");
  const decision = evaluateCancellation({ startsAt: new Date(b.starts_at), now: ctx.now(), policy: ctx.gym.settings.cancellation, override: args.override });
  await ctx.store.update("private_bookings", b.id, { status: decision.kind === "free" ? "cancelled" : "late_cancelled", cancelled_at: ctx.now().toISOString() });
  const ledger = await ctx.store.list("credit_ledger", { where: { ref_id: b.id, reason: "booking" } });
  if (decision.restoreCredit) for (const l of ledger) await returnCredit(ctx, l.entitlement_id, b.id);
  // Paid by card and cancelled within policy → automatic full refund (splits reverse).
  if (decision.restoreCredit && b.transaction_id) {
    await refundTransaction(ctx, { transactionId: b.transaction_id, reason: "Private lesson cancelled within policy", creditsAction: "none", override: true });
  }
  if (args.override) await audit(ctx, "late_cancel.override", "private_bookings", b.id, { reason: args.reason ?? "" });
  return decision;
}
