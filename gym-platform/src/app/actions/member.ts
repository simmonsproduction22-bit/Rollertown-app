"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, publicCtx, withParam } from "@/lib/ctx";
import { AppError, fail } from "@/lib/result";
import { bookClass, bookPrivate, cancelClassBooking, cancelPrivate } from "@/lib/services/bookings";
import { purchaseProduct } from "@/lib/services/checkout";
import { signWaiver } from "@/lib/services/waivers";
import { checkIn, verifyQrToken } from "@/lib/services/checkin";
import { createLead } from "@/lib/services/comms";
import type { Ctx } from "@/lib/services/context";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const escapeXml = (v: string) => v.replace(/[<>&"']/g, "");

/** Members/guardians may only act for themselves or children they guard. */
async function assertMine(ctx: Ctx, memberId: string, sessionMemberId: string | null): Promise<void> {
  if (memberId === sessionMemberId) return;
  const g = await ctx.store.first("guardians", { where: { child_member_id: memberId, guardian_member_id: sessionMemberId ?? "-" } });
  if (!g) throw new AppError("You can only manage your own (or your child's) account.", 403);
}

export async function memberBookAction(f: FormData) {
  await runAction("member.self", s(f, "back") || "/m/book", async (ctx, sess) => {
    await assertMine(ctx, s(f, "memberId"), sess.memberId);
    const b = await bookClass(ctx, { sessionId: s(f, "sessionId"), memberId: s(f, "memberId"), source: "app" });
    return b.status === "waitlisted" ? `Class is full. You're #${b.waitlist_position} on the waitlist, and we'll text you if a spot opens.` : "You're booked! A reminder is coming before class.";
  });
}

export async function memberCancelAction(f: FormData) {
  await runAction("member.self", "/m", async (ctx, sess) => {
    if (s(f, "kind") !== "private") {
      const b = await ctx.store.get("class_bookings", s(f, "bookingId"));
      if (!b) throw new AppError("Booking not found", 404);
      await assertMine(ctx, b.member_id, sess.memberId);
      const d = await cancelClassBooking(ctx, { bookingId: b.id });
      return d.explanation + (d.feeCents ? ` A $${(d.feeCents / 100).toFixed(2)} late-cancel fee applies.` : "");
    }
    const parts = await ctx.store.list("private_booking_participants", { where: { booking_id: s(f, "bookingId") } });
    if (!parts.some((p) => p.member_id === sess.memberId)) throw new AppError("Booking not found", 404);
    return (await cancelPrivate(ctx, { bookingId: s(f, "bookingId") })).explanation;
  });
}

export async function memberBuyAction(f: FormData) {
  await runAction("member.self", "/m/pay", async (ctx, sess) => {
    const memberId = s(f, "memberId") || sess.memberId || "";
    await assertMine(ctx, memberId, sess.memberId);
    const r = await purchaseProduct(ctx, { productId: s(f, "productId"), memberId });
    if (r.transaction.status !== "succeeded") throw new AppError(`Card declined: ${r.transaction.failure_reason}. Update your card and try again.`);
    return `Paid $${(r.transaction.total_cents / 100).toFixed(2)}. Receipt ${r.transaction.receipt_number} emailed.`;
  });
}

export async function memberBookPrivateAction(f: FormData) {
  await runAction("member.self", "/m/privates", async (ctx, sess) => {
    if (!sess.memberId) throw new AppError("No member profile on this account.");
    await bookPrivate(ctx, { coachId: s(f, "coachId"), lessonTypeId: s(f, "lessonTypeId"), startsAt: s(f, "startsAt"), memberIds: [sess.memberId] });
    return "Private lesson booked. See you on the mat!";
  });
}

export async function signWaiverAction(f: FormData) {
  await runAction("member.self", "/m", async (ctx, sess) => {
    await assertMine(ctx, s(f, "memberId"), sess.memberId);
    const h = await headers();
    await signWaiver(ctx, {
      templateId: s(f, "templateId"), memberId: s(f, "memberId"), signerName: s(f, "signerName"),
      relationship: s(f, "relationship") as "self", signerEmail: sess.email, signatureSvg: s(f, "signature"), agree: f.get("agree") === "on" ? true : (false as never),
    }, { ip: h.get("x-forwarded-for")?.split(",")[0] ?? null, userAgent: h.get("user-agent") });
    return "Waiver signed. A PDF copy is on file.";
  });
}

export async function kioskQrAction(f: FormData) {
  await runAction("checkin.kiosk", "/kiosk", async (ctx) => {
    const r = await checkIn(ctx, { memberId: verifyQrToken(s(f, "token")), method: "qr" });
    return `✓ ${r.member.first_name} checked in${r.className ? ` to ${r.className}` : ""}.${r.warnings.length ? ` ⚠ ${r.warnings.join(" · ")}` : ""}`;
  });
}

// ------------------------------------------------------------ public (no account)
const hits = new Map<string, number[]>();
/** Minimal in-memory rate limit for public forms. Swap for Redis/Upstash in production. */
async function limit(key: string, max = 5, windowMs = 10 * 60_000): Promise<void> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError("Too many requests. Please try again in a few minutes.", 429);
  hits.set(k, [...recent, now]);
}

async function findOrCreateGuest(ctx: Ctx, f: FormData) {
  const email = s(f, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("Enter a valid email.");
  const name = s(f, "name").split(/\s+/).filter(Boolean);
  if (!name[0]) throw new AppError("Enter your name.");
  const existing = await ctx.store.first("members", { where: { gym_id: ctx.gym.id, email } });
  return existing ?? ctx.store.insert("members", {
    gym_id: ctx.gym.id, first_name: name[0].slice(0, 60), last_name: name.slice(1).join(" ").slice(0, 60) || "-",
    email, phone: s(f, "phone") || null, status: "trial", created_at: new Date().toISOString(),
  });
}

/** Book a trial class or a private with only an email. Accounts are optional. */
export async function publicBookAction(f: FormData) {
  const slug = s(f, "slug");
  const backUrl = s(f, "back") || `/g/${slug}`;
  let target: string;
  try {
    await limit("public-book");
    const ctx = await publicCtx(slug);
    const member = await findOrCreateGuest(ctx, f);
    if (s(f, "kind") === "trial") {
      if (f.get("waiver") !== "on") throw new AppError("Please accept the waiver to book.");
      const tpl = (await ctx.store.list("waiver_templates", { where: { gym_id: ctx.gym.id, is_current: true } }))[0];
      const signed = tpl ? await ctx.store.first("waiver_signatures", { where: { member_id: member.id, template_id: tpl.id } }) : null;
      if (tpl && !signed) {
        await signWaiver(ctx, {
          templateId: tpl.id, memberId: member.id, signerName: s(f, "name"), relationship: "self", signerEmail: member.email ?? "",
          signatureSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 40"><text x="4" y="28">${escapeXml(s(f, "name"))} (typed)</text></svg>`, agree: true,
        });
      }
      await bookClass(ctx, { sessionId: s(f, "sessionId"), memberId: member.id, trial: true, source: "public_page" });
      const lead = await createLead(ctx, { firstName: member.first_name, lastName: member.last_name, email: member.email ?? "", phone: s(f, "phone"), interest: "Trial class", source: "public_page" });
      await ctx.store.update("leads", lead.id, { stage: "trial_booked", member_id: member.id, trial_session_id: s(f, "sessionId") });
      target = withParam(backUrl, "msg", "You're booked for a free trial! Check your email for details.");
    } else {
      const lt = await ctx.store.get("lesson_types", s(f, "lessonTypeId"));
      if (!lt || lt.gym_id !== ctx.gym.id) throw new AppError("Lesson not found", 404);
      const b = await bookPrivate(ctx, { coachId: s(f, "coachId"), lessonTypeId: lt.id, startsAt: s(f, "startsAt"), memberIds: [member.id], pay: "card" });
      await ctx.store.update("private_bookings", b.id, { booked_by_email: member.email, booked_by_name: s(f, "name") });
      target = withParam(backUrl, "msg", `Booked! $${(lt.price_cents / 100).toFixed(2)} charged. Confirmation sent to ${member.email}.`);
    }
  } catch (e) {
    target = withParam(backUrl, "err", fail(e).error ?? "Booking failed");
  }
  redirect(target);
}

export async function publicLeadAction(f: FormData) {
  const slug = s(f, "slug");
  let target: string;
  try {
    await limit("lead", 3);
    if (s(f, "website")) throw new AppError("Spam detected"); // honeypot field
    const ctx = await publicCtx(slug);
    await createLead(ctx, { firstName: s(f, "firstName"), lastName: s(f, "lastName"), email: s(f, "email"), phone: s(f, "phone"), interest: s(f, "interest"), source: "web_form" });
    target = `/g/${slug}?msg=${encodeURIComponent("Thanks! We'll text you shortly to set up your free trial.")}`;
  } catch (e) {
    target = `/g/${slug}?err=${encodeURIComponent(fail(e).error ?? "Failed")}`;
  }
  redirect(target);
}
