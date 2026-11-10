import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { safeNext } from "@/lib/auth/safe-next";
import { RANK_TEMPLATES } from "@/lib/domain/rank-templates";
import { acceptInvite, applyRankTemplates, createFirstClasses, findInvite, hashInviteToken, inviteStaff, materializeSessions, pendingInvites, revokeInvite } from "@/lib/services/onboarding";
import { makeCtx, NOW } from "./helpers";

const tokenFrom = (url: string) => url.split("/invite/")[1];

describe("rank templates", () => {
  it("creates only styles the gym doesn't have yet", async () => {
    const ctx = await makeCtx();
    for (const s of await ctx.store.list("rank_systems", { where: { gym_id: ctx.gym.id, style: "muay_thai" } })) await ctx.store.remove("rank_systems", s.id);
    const created = await applyRankTemplates(ctx, ["bjj", "muay_thai", "muay_thai"]);
    expect(created.map((s) => s.style)).toEqual(["muay_thai"]);
    const ranks = await ctx.store.list("ranks", { where: { system_id: created[0].id } });
    expect(ranks).toHaveLength(RANK_TEMPLATES.muay_thai.ranks.length);
    expect(ranks.map((r) => r.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(created[0].discipline_id).not.toBeNull();
    expect(await applyRankTemplates(ctx, ["muay_thai"])).toEqual([]);
  });
});

describe("first classes", () => {
  it("creates a type + weekly series and materializes sessions in the booking window", async () => {
    const ctx = await makeCtx();
    const [series] = await createFirstClasses(ctx, [{ name: "Sunrise Wrestling", weekday: 3, startTime: "06:30" }, { name: " ", weekday: 1, startTime: "18:00" }]);
    expect(series.weekday).toBe(3);
    const sessions = await ctx.store.list("class_sessions", { where: { series_id: series.id } });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    for (const s of sessions) {
      expect(new Date(s.starts_at) > NOW).toBe(true);
      // 06:30 in America/New_York on a Wednesday.
      const local = new Intl.DateTimeFormat("en-US", { timeZone: ctx.gym.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s.starts_at));
      expect(local).toBe("Wed 06:30");
    }
    expect(await materializeSessions(ctx)).toBe(0); // idempotent
  });

  it("reuses an existing class type by name and rejects bad times", async () => {
    const ctx = await makeCtx();
    const existing = (await ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }))[0];
    const [series] = await createFirstClasses(ctx, [{ name: existing.name.toUpperCase(), weekday: 0, startTime: "10:00" }]);
    expect(series.class_type_id).toBe(existing.id);
    await expect(createFirstClasses(ctx, [{ name: "Judo", weekday: 2, startTime: "25:00" }])).rejects.toThrow(/start time/);
  });
});

describe("invites", () => {
  it("invites a coach, creates their profile, and stores only a token hash", async () => {
    const ctx = await makeCtx();
    const r = await inviteStaff(ctx, { email: "Jo.Silva@Example.com", kind: "independent_coach" });
    const raw = tokenFrom(r.url);
    expect(r.invite.email).toBe("jo.silva@example.com");
    expect(r.invite.role).toBe("independent_coach");
    expect(r.invite.token_hash).toBe(hashInviteToken(raw));
    expect(JSON.stringify(r.invite)).not.toContain(raw);
    expect(r.coach).toMatchObject({ display_name: "Jo Silva", slug: "jo-silva", employment: "independent", user_id: null });
    const outbox = await ctx.store.list("notifications_outbox", { where: { ref_id: r.invite.id } });
    expect(outbox[0].body).not.toContain(raw);
  });

  it("re-inviting the same email replaces the pending invite", async () => {
    const ctx = await makeCtx();
    const a = await inviteStaff(ctx, { email: "desk@example.com", kind: "front_desk" });
    const b = await inviteStaff(ctx, { email: "desk@example.com", kind: "front_desk" });
    const pending = await pendingInvites(ctx);
    expect(pending.map((p) => p.id)).toContain(b.invite.id);
    expect(pending.map((p) => p.id)).not.toContain(a.invite.id);
    expect((await findInvite(ctx.store, tokenFrom(a.url), NOW)).ok).toBe(false);
    expect(b.coach).toBeNull();
  });

  it("accepts only for the invited email, grants the role once, links the coach, and burns the token", async () => {
    const ctx = await makeCtx();
    const r = await inviteStaff(ctx, { email: "coach.k@example.com", kind: "staff_coach" });
    const raw = tokenFrom(r.url);
    const userId = "11111111-2222-4333-8444-555555555555";
    await expect(acceptInvite(ctx.store, { rawToken: raw, userId, email: "someone.else@example.com", now: NOW })).rejects.toThrow(/Sign in with that email/);

    const ok = await acceptInvite(ctx.store, { rawToken: raw, userId, email: "COACH.K@example.com", now: NOW });
    expect(ok).toEqual({ gymId: ctx.gym.id, role: "coach" });
    const rows = await ctx.store.list("gym_users", { where: { user_id: userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "coach", coach_id: r.coach!.id, gym_id: ctx.gym.id });
    expect((await ctx.store.get("coaches", r.coach!.id))!.user_id).toBe(userId);
    await expect(acceptInvite(ctx.store, { rawToken: raw, userId, email: "coach.k@example.com", now: NOW })).rejects.toThrow(/already used/);
  });

  it("rejects expired, revoked and malformed tokens", async () => {
    const ctx = await makeCtx();
    const r = await inviteStaff(ctx, { email: "late@example.com", kind: "manager" });
    const later = new Date(NOW.getTime() + 15 * 86_400_000);
    expect(await findInvite(ctx.store, tokenFrom(r.url), later)).toEqual({ ok: false, reason: "expired" });
    await revokeInvite(ctx, r.invite.id);
    expect(await findInvite(ctx.store, tokenFrom(r.url), NOW)).toEqual({ ok: false, reason: "used" });
    expect(await findInvite(ctx.store, "../../etc", NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses to invite someone who already has the role", async () => {
    const ctx = await makeCtx();
    const owner = (await ctx.store.list("gym_users", { where: { gym_id: ctx.gym.id, role: "manager" } }))[0];
    await expect(inviteStaff(ctx, { email: owner.invited_email!, kind: "manager" })).rejects.toThrow(/already has/);
  });
});

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, "/x\r\nSet-Cookie: a"]) expect(safeNext(bad)).toBe("/app");
  });
});
