import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CheckIn, ClassSession, Member } from "@/lib/data/types";
import { env } from "@/lib/env";
import { AppError } from "@/lib/result";
import { mustGet, type Ctx } from "./context";
import { findClassEntitlement } from "./bookings";
import { waiverStatus } from "./waivers";
import { emitWebhook } from "./webhooks";

const secret = () => env.webhookSigningSecret || "dev-only-qr-secret";

/** Member QR codes carry a signed, day-scoped token: "<memberId>.<yyyymmdd>.<sig>". */
export function qrToken(memberId: string, day = new Date()): string {
  const d = day.toISOString().slice(0, 10).replace(/-/g, "");
  const sig = createHmac("sha256", secret()).update(`${memberId}.${d}`).digest("base64url").slice(0, 22);
  return `${memberId}.${d}.${sig}`;
}

export function verifyQrToken(token: string, now = new Date()): string {
  const [memberId, d, sig] = token.split(".");
  if (!memberId || !d || !sig) throw new AppError("Invalid QR code.");
  const valid = [0, -1].some((offset) => {
    const expected = qrToken(memberId, new Date(now.getTime() + offset * 86_400_000)).split(".")[2];
    return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  });
  if (!valid) throw new AppError("This QR code expired. Refresh it in the app.");
  return memberId;
}

export const checkInSchema = z.object({ memberId: z.string().uuid(), method: z.enum(["kiosk", "qr", "staff", "api"]), sessionId: z.string().uuid().optional() });

export interface CheckInResult {
  readonly checkIn: CheckIn;
  readonly member: Member;
  readonly session: ClassSession | null;
  readonly className: string | null;
  readonly warnings: string[];
}

/**
 * Check a member in. Matches the class starting within -30/+20 minutes,
 * marks their booking attended (or books them in if there's room and they
 * have credits), and returns warnings for the desk (waiver, balance, pickup).
 */
export async function checkIn(ctx: Ctx, input: z.input<typeof checkInSchema>): Promise<CheckInResult> {
  const args = checkInSchema.parse(input);
  const member = await mustGet(ctx, "members", args.memberId);
  const warnings: string[] = [];
  if (member.status === "cancelled") throw new AppError(`${member.first_name}'s membership is cancelled. Please see the front desk.`);
  if (member.status === "frozen") warnings.push("Membership is on hold.");
  if (member.status === "past_due") warnings.push("Payment past due: card update needed.");
  const ws = await waiverStatus(ctx, member.id);
  if (!ws.ok) warnings.push(ws.needsResign ? "Waiver updated: needs to re-sign." : "No waiver on file.");
  if (member.pickup_notes) warnings.push(`Pickup: ${member.pickup_notes}`);

  const nowMs = ctx.now().getTime();
  const today = await ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id, starts_at: { gte: new Date(nowMs - 2 * 3_600_000).toISOString() } } });
  const bookings = await ctx.store.list("class_bookings", { where: { member_id: member.id } });
  const window = (s: ClassSession) => new Date(s.starts_at).getTime() - nowMs;
  const candidates = today.filter((s) => !s.is_cancelled && window(s) <= 30 * 60_000 && window(s) >= -20 * 60_000);
  const session = args.sessionId
    ? candidates.find((s) => s.id === args.sessionId) ?? null
    : candidates.find((s) => bookings.some((b) => b.session_id === s.id && b.status === "booked")) ?? candidates[0] ?? null;

  const dup = (await ctx.store.list("check_ins", { where: { member_id: member.id, checked_in_at: { gte: new Date(nowMs - 3 * 3_600_000).toISOString() } } }))
    .find((c) => c.session_id === (session?.id ?? null));
  if (dup) throw new AppError(`${member.first_name} is already checked in.`);

  if (session) {
    const booking = bookings.find((b) => b.session_id === session.id);
    if (booking && ["booked", "waitlisted"].includes(booking.status)) {
      await ctx.store.update("class_bookings", booking.id, { status: "attended", waitlist_position: null });
    } else if (!booking || ["cancelled", "late_cancelled"].includes(booking.status)) {
      const { membershipId, entitlement } = await findClassEntitlement(ctx, member.id);
      if (!membershipId && !entitlement) warnings.push("No credits: collect a drop-in at the desk.");
      const row = { gym_id: ctx.gym.id, session_id: session.id, member_id: member.id, status: "attended" as const, waitlist_position: null, is_trial: false, is_drop_in: !membershipId && !entitlement, entitlement_id: entitlement?.id ?? null, membership_id: membershipId, source: args.method, cancelled_at: null, fee_cents: 0 };
      if (booking) await ctx.store.update("class_bookings", booking.id, row);
      else await ctx.store.insert("class_bookings", { ...row, created_at: ctx.now().toISOString() });
      if (entitlement) {
        await ctx.store.update("entitlements", entitlement.id, { credits_used: entitlement.credits_used + 1, status: entitlement.credits_used + 1 >= entitlement.credits_total ? "exhausted" : "active" });
        await ctx.store.insert("credit_ledger", { gym_id: ctx.gym.id, entitlement_id: entitlement.id, delta: -1, reason: "booking", ref_id: session.id, created_at: ctx.now().toISOString() });
      }
    }
  }
  const ci = await ctx.store.insert("check_ins", { gym_id: ctx.gym.id, member_id: member.id, session_id: session?.id ?? null, location_id: session?.location_id ?? null, method: args.method, checked_in_at: ctx.now().toISOString(), checked_in_by: args.method === "staff" ? ctx.actor.userId : null });
  if (ctx.store.kind === "memory") await ctx.store.update("members", member.id, { last_attended_at: ci.checked_in_at });
  const className = session ? (await ctx.store.get("class_types", session.class_type_id))?.name ?? null : null;
  await emitWebhook(ctx, "checkin.created", { check_in_id: ci.id, member_id: member.id, session_id: session?.id ?? null });
  return { checkIn: ci, member, session, className, warnings };
}
