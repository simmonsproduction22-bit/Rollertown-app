import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { bookClass, bookPrivate, cancelClassBooking, privateSlots } from "@/lib/services/bookings";
import { checkIn, qrToken, verifyQrToken } from "@/lib/services/checkin";
import { DEMO_COACH_IDS, DEMO_MEMBER_ID } from "@/lib/seed/constants";
import { makeCtx, NOW } from "./helpers";

async function futureSession(ctx: Awaited<ReturnType<typeof makeCtx>>, minHours = 24) {
  const sessions = await ctx.store.list("class_sessions", { order: { column: "starts_at" } });
  const types = await ctx.store.list("class_types");
  const adult = types.filter((t) => !t.is_kids && t.allow_trial).map((t) => t.id);
  return sessions.find((s) => adult.includes(s.class_type_id) && new Date(s.starts_at).getTime() - NOW.getTime() > minHours * 3_600_000)!;
}

describe("class booking", () => {
  it("waitlists when full and promotes when someone cancels", async () => {
    const ctx = await makeCtx();
    const s = await futureSession(ctx, 30);
    await ctx.store.update("class_sessions", s.id, { capacity: 1 });
    const existing = await ctx.store.list("class_bookings", { where: { session_id: s.id } });
    for (const b of existing) await ctx.store.remove("class_bookings", b.id);
    const actives = (await ctx.store.list("members", { where: { status: "active" } })).filter((m) => m.email);
    const first = await bookClass(ctx, { sessionId: s.id, memberId: actives[0].id });
    const second = await bookClass(ctx, { sessionId: s.id, memberId: actives[1].id });
    expect(first.status).toBe("booked");
    expect(second.status).toBe("waitlisted");
    const decision = await cancelClassBooking(ctx, { bookingId: first.id });
    expect(decision.kind).toBe("free");
    expect((await ctx.store.get("class_bookings", second.id))?.status).toBe("booked");
  });

  it("late cancel inside 12h charges the policy fee", async () => {
    const ctx = await makeCtx();
    const s = await futureSession(ctx, 30);
    const lateNow = new Date(new Date(s.starts_at).getTime() - 3 * 3_600_000);
    const lateCtx = { ...ctx, now: () => lateNow };
    const existing = (await ctx.store.list("class_bookings", { where: { session_id: s.id, member_id: DEMO_MEMBER_ID } }))[0];
    const booking = existing ?? (await bookClass(ctx, { sessionId: s.id, memberId: DEMO_MEMBER_ID }));
    const d = await cancelClassBooking(lateCtx, { bookingId: booking.id });
    expect(d.kind).toBe("late");
    const fees = await ctx.store.list("transactions", { where: { description: "Late-cancel fee", member_id: DEMO_MEMBER_ID } });
    expect(fees[0]?.total_cents).toBe(1500);
  });

  it("blocks booking without a current waiver", async () => {
    const ctx = await makeCtx();
    const s = await futureSession(ctx);
    const sig = (await ctx.store.list("waiver_signatures", { where: { member_id: DEMO_MEMBER_ID } }));
    for (const x of sig) await ctx.store.remove("waiver_signatures", x.id);
    const mine = await ctx.store.list("class_bookings", { where: { session_id: s.id, member_id: DEMO_MEMBER_ID } });
    for (const b of mine) await ctx.store.remove("class_bookings", b.id);
    await expect(bookClass(ctx, { sessionId: s.id, memberId: DEMO_MEMBER_ID })).rejects.toThrow(/waiver/);
  });
});

describe("private lessons", () => {
  it("books an available slot using credits and blocks double-booking", async () => {
    const ctx = await makeCtx();
    const lt = (await ctx.store.list("lesson_types", { where: { coach_id: DEMO_COACH_IDS.rafael } })).find((l) => l.duration_min === 60 && l.max_participants === 1 && !l.is_intro)!;
    let date = "";
    let slots: Awaited<ReturnType<typeof privateSlots>> = [];
    for (let i = 2; i < 9 && slots.length === 0; i++) {
      date = new Date(NOW.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      slots = await privateSlots(ctx, { coachId: DEMO_COACH_IDS.rafael, lessonTypeId: lt.id, date });
    }
    expect(slots.length).toBeGreaterThan(0);
    const booking = await bookPrivate(ctx, { coachId: DEMO_COACH_IDS.rafael, lessonTypeId: lt.id, startsAt: slots[0].start.toISOString(), memberIds: [DEMO_MEMBER_ID] });
    expect(booking.status).toBe("confirmed");
    expect(booking.entitlement_id).not.toBeNull();
    await expect(bookPrivate(ctx, { coachId: DEMO_COACH_IDS.rafael, lessonTypeId: lt.id, startsAt: slots[0].start.toISOString(), memberIds: [DEMO_MEMBER_ID] })).rejects.toThrow(/no longer available/);
  });
});

describe("check-in", () => {
  it("QR tokens verify and expire", () => {
    const t = qrToken(DEMO_MEMBER_ID, NOW);
    expect(verifyQrToken(t, NOW)).toBe(DEMO_MEMBER_ID);
    expect(() => verifyQrToken(t, new Date(NOW.getTime() + 3 * 86_400_000))).toThrow(/expired/);
    expect(() => verifyQrToken(t.slice(0, -2) + "xx", NOW)).toThrow();
  });
  it("checks into the class starting now and marks attendance", async () => {
    const ctx = await makeCtx();
    const s = await futureSession(ctx, 0);
    const at = new Date(new Date(s.starts_at).getTime() - 10 * 60_000);
    const c = { ...ctx, now: () => at };
    const r = await checkIn(c, { memberId: DEMO_MEMBER_ID, method: "qr" });
    expect(r.session?.id).toBe(s.id);
    const b = (await ctx.store.list("class_bookings", { where: { session_id: s.id, member_id: DEMO_MEMBER_ID } }))[0];
    expect(b.status).toBe("attended");
    await expect(checkIn(c, { memberId: DEMO_MEMBER_ID, method: "qr" })).rejects.toThrow(/already checked in/);
  });
});
