import { createHash, randomBytes } from "node:crypto";
import type { Store } from "@/lib/data/store";
import type { ClassSeries, Coach, GymInvite, InviteRole, RankSystem } from "@/lib/data/types";
import { env } from "@/lib/env";
import { addDays, expandSeries } from "@/lib/domain/recurrence";
import { RANK_TEMPLATES, type RankTemplateKey } from "@/lib/domain/rank-templates";
import { localDate } from "@/lib/format";
import { emailProvider } from "@/lib/messaging/email";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";

const INVITE_TTL_DAYS = 14;
export const hashInviteToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---------------------------------------------------------------------------
// Rank systems
// ---------------------------------------------------------------------------

/** Creates each chosen starter rank system once. Re-running skips styles the gym already has. */
export async function applyRankTemplates(ctx: Ctx, keys: readonly RankTemplateKey[]): Promise<RankSystem[]> {
  const [existing, disciplines] = await Promise.all([
    ctx.store.list("rank_systems", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("disciplines", { where: { gym_id: ctx.gym.id } }),
  ]);
  const created: RankSystem[] = [];
  for (const key of new Set(keys)) {
    if (existing.some((s) => s.style === key)) continue;
    const t = RANK_TEMPLATES[key];
    const discipline = t.disciplineSlugs.map((slug) => disciplines.find((d) => d.slug === slug)).find(Boolean) ?? null;
    const sys = await ctx.store.insert("rank_systems", { gym_id: ctx.gym.id, discipline_id: discipline?.id ?? null, name: t.name, style: key, uses_stripes: t.usesStripes, created_at: ctx.now().toISOString() });
    await ctx.store.insertMany("ranks", t.ranks.map((r, i) => ({
      gym_id: ctx.gym.id, system_id: sys.id, name: r.name, color: r.color, sort_order: i + 1, max_stripes: r.maxStripes,
      min_classes: r.minClasses, min_months: r.minMonths, classes_per_stripe: r.classesPerStripe, months_per_stripe: r.monthsPerStripe, requirements: null,
    })));
    created.push(sys);
  }
  if (created.length) await audit(ctx, "onboarding.rank_systems", "rank_systems", null, { styles: created.map((s) => s.style) });
  return created;
}

// ---------------------------------------------------------------------------
// First classes + session materialization
// ---------------------------------------------------------------------------

export interface FirstClassInput { readonly name: string; readonly weekday: number; readonly startTime: string }

/** Finds or creates a class type per name, adds a weekly series, and materializes sessions for the booking window. */
export async function createFirstClasses(ctx: Ctx, rows: readonly FirstClassInput[]): Promise<ClassSeries[]> {
  const clean = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name.length >= 2);
  if (clean.length === 0) return [];
  for (const r of clean) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) throw new AppError("Pick a day for each class.", 400, "VALIDATION");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime)) throw new AppError("Use a valid start time (HH:MM).", 400, "VALIDATION");
  }
  const [types, disciplines, location] = await Promise.all([
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("disciplines", { where: { gym_id: ctx.gym.id } }),
    ctx.store.first("locations", { where: { gym_id: ctx.gym.id, is_primary: true } }),
  ]);
  const today = localDate(ctx.now(), ctx.gym.timezone);
  const out: ClassSeries[] = [];
  for (const r of clean) {
    let type = types.find((t) => t.name.toLowerCase() === r.name.toLowerCase());
    if (!type) {
      const words = r.name.toLowerCase();
      const discipline = disciplines.find((d) => words.includes(d.name.toLowerCase()) || words.includes(d.slug.replace(/-/g, " ")))
        ?? disciplines.find((d) => (words.includes("bjj") || words.includes("jiu")) && d.slug === "brazilian-jiu-jitsu")
        ?? null;
      const isKids = /\bkid|junior|youth|little/.test(words);
      type = await ctx.store.insert("class_types", {
        gym_id: ctx.gym.id, discipline_id: discipline?.id ?? null, name: r.name, description: null, color: "#e11d48",
        default_capacity: isKids ? 20 : 30, duration_min: 60, is_kids: isKids, age_min: isKids ? 4 : null, age_max: isKids ? 15 : null,
        allow_drop_in: !isKids, drop_in_price_cents: 2500, allow_trial: true, requires_rank_order: null, created_at: ctx.now().toISOString(),
      });
      types.push(type);
    }
    out.push(await ctx.store.insert("class_series", {
      gym_id: ctx.gym.id, class_type_id: type.id, location_id: location?.id ?? null, weekday: r.weekday, start_time: r.startTime,
      duration_min: type.duration_min, capacity: type.default_capacity, starts_on: today, created_at: ctx.now().toISOString(),
    }));
  }
  await materializeSessions(ctx);
  await audit(ctx, "onboarding.first_classes", "class_series", null, { count: out.length });
  return out;
}

/**
 * Creates any missing sessions for active series up to the booking window
 * (settings.booking.open_days_ahead). Idempotent; the cron calls it daily-ish.
 */
export async function materializeSessions(ctx: Ctx, daysAhead = ctx.gym.settings.booking.open_days_ahead): Promise<number> {
  const from = localDate(ctx.now(), ctx.gym.timezone);
  const to = addDays(from, daysAhead);
  const series = await ctx.store.list("class_series", { where: { gym_id: ctx.gym.id, is_active: true } });
  if (series.length === 0) return 0;
  const existing = await ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id, series_id: { in: series.map((s) => s.id) }, starts_at: { gte: ctx.now().toISOString() } } });
  const have = new Set(existing.map((s) => `${s.series_id}|${new Date(s.starts_at).getTime()}`));
  const rows = [];
  for (const s of series) {
    for (const occ of expandSeries({ id: s.id, weekday: s.weekday, startTime: s.start_time.slice(0, 5), durationMin: s.duration_min, startsOn: s.starts_on, endsOn: s.ends_on }, from, to, ctx.gym.timezone)) {
      if (occ.startsAt <= ctx.now() || have.has(`${s.id}|${occ.startsAt.getTime()}`)) continue;
      rows.push({ gym_id: ctx.gym.id, series_id: s.id, class_type_id: s.class_type_id, location_id: s.location_id, room_id: s.room_id, coach_id: s.coach_id, starts_at: occ.startsAt.toISOString(), ends_at: occ.endsAt.toISOString(), capacity: s.capacity, created_at: ctx.now().toISOString() });
    }
  }
  if (rows.length) await ctx.store.insertMany("class_sessions", rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export type InviteKind = "staff_coach" | "independent_coach" | "head_coach" | "manager" | "front_desk";
const ROLE_FOR: Record<InviteKind, InviteRole> = { staff_coach: "coach", independent_coach: "independent_coach", head_coach: "head_coach", manager: "manager", front_desk: "front_desk" };
const isCoachRole = (r: InviteRole) => r === "coach" || r === "head_coach" || r === "independent_coach";

export interface InviteResult { readonly invite: GymInvite; readonly url: string; readonly coach: Coach | null; readonly emailed: boolean }

/**
 * Invites a person by email. Coach roles get a coach profile up front (so the
 * owner can set splits and rent before they accept). A new invite to the same
 * email replaces any pending one.
 */
export async function inviteStaff(ctx: Ctx, args: { email: string; kind: InviteKind; name?: string }): Promise<InviteResult> {
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email.", 400, "VALIDATION");
  const role = ROLE_FOR[args.kind];
  const nowIso = ctx.now().toISOString();

  const already = (await ctx.store.list("gym_users", { where: { gym_id: ctx.gym.id } })).some((u) => u.invited_email?.toLowerCase() === email && u.role === role);
  if (already) throw new AppError("That person already has this role.", 409, "CONFLICT");
  for (const p of await ctx.store.list("gym_invites", { where: { gym_id: ctx.gym.id, accepted_at: { isNull: true }, revoked_at: { isNull: true } } })) {
    if (p.email.toLowerCase() === email) await ctx.store.update("gym_invites", p.id, { revoked_at: nowIso });
  }

  let coach: Coach | null = null;
  if (isCoachRole(role)) {
    const coaches = await ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } });
    coach = coaches.find((c) => c.email?.toLowerCase() === email) ?? null;
    if (!coach) {
      const display = args.name?.trim() || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const base = (slugify(display) || "coach").slice(0, 54);
      let slug = base.length >= 2 ? base : `coach-${base}`;
      for (let i = 2; coaches.some((c) => c.slug === slug); i++) slug = `${base}-${i}`;
      const independent = role === "independent_coach";
      coach = await ctx.store.insert("coaches", {
        gym_id: ctx.gym.id, user_id: null, display_name: display, slug, email, phone: null, bio: null, specialties: [], photo_path: null, color: "#6366f1",
        employment: independent ? "independent" : "staff", default_coach_split_bps: independent ? 8000 : 7000, rent_model: "none", rent_amount_cents: 0,
        stripe_account_id: null, stripe_payouts_enabled: false, accepts_privates: true, is_active: true, created_at: nowIso,
      });
    }
  }

  const raw = randomBytes(32).toString("base64url");
  const invite = await ctx.store.insert("gym_invites", {
    gym_id: ctx.gym.id, email, role, coach_id: coach?.id ?? null, token_hash: hashInviteToken(raw), invited_by: ctx.actor.userId,
    expires_at: new Date(ctx.now().getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString(), created_at: nowIso,
  });
  const url = `${env.appUrl}/invite/${raw}`;
  const roleLabel = role.replace(/_/g, " ");
  const sent = await emailProvider().send({
    to: email, subject: `You're invited to ${ctx.gym.name}`,
    text: `${ctx.actor.label} invited you to join ${ctx.gym.name} as ${/^[aeiou]/.test(roleLabel) ? "an" : "a"} ${roleLabel}.\n\nAccept within ${INVITE_TTL_DAYS} days: ${url}\n\nSign in with this email address (${email}). If you weren't expecting this, ignore it.`,
  });
  await ctx.store.insert("notifications_outbox", { gym_id: ctx.gym.id, channel: "email", to_address: email, subject: `Invite to ${ctx.gym.name}`, body: `Invite link sent (${roleLabel}).`, category: "other", ref_id: invite.id, send_after: nowIso, sent_at: sent.status === "sent" ? nowIso : null, status: sent.status === "sent" ? "sent" : "failed", error: sent.error ?? null, created_at: nowIso });
  await audit(ctx, "invite.created", "gym_invites", invite.id, { email, role });
  return { invite, url, coach, emailed: sent.status === "sent" };
}

export async function revokeInvite(ctx: Ctx, inviteId: string): Promise<void> {
  const inv = await mustGet(ctx, "gym_invites", inviteId);
  if (inv.accepted_at) throw new AppError("That invite was already accepted.", 409, "CONFLICT");
  await ctx.store.update("gym_invites", inv.id, { revoked_at: ctx.now().toISOString() });
  await audit(ctx, "invite.revoked", "gym_invites", inv.id, { email: inv.email });
}

export async function pendingInvites(ctx: Ctx): Promise<GymInvite[]> {
  const now = ctx.now().toISOString();
  return (await ctx.store.list("gym_invites", { where: { gym_id: ctx.gym.id, accepted_at: { isNull: true }, revoked_at: { isNull: true } }, order: { column: "created_at", ascending: false } }))
    .filter((i) => i.expires_at > now);
}

export type InviteLookup =
  | { readonly ok: true; readonly invite: GymInvite; readonly gymName: string }
  | { readonly ok: false; readonly reason: "not_found" | "expired" | "used" };

/** Looks up an invite by raw token. `store` must be able to read across gyms (service store). */
export async function findInvite(store: Store, rawToken: string, now: Date): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(rawToken)) return { ok: false, reason: "not_found" };
  const invite = await store.first("gym_invites", { where: { token_hash: hashInviteToken(rawToken) } });
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.accepted_at || invite.revoked_at) return { ok: false, reason: "used" };
  if (invite.expires_at <= now.toISOString()) return { ok: false, reason: "expired" };
  const gym = await store.get("gyms", invite.gym_id);
  return gym ? { ok: true, invite, gymName: gym.name } : { ok: false, reason: "not_found" };
}

/**
 * Accepts an invite for a signed-in user. The user's verified email must match
 * the invite. Grants the role, links the coach profile, and burns the token.
 */
export async function acceptInvite(store: Store, args: { rawToken: string; userId: string; email: string; now: Date }): Promise<{ gymId: string; role: InviteRole }> {
  const found = await findInvite(store, args.rawToken, args.now);
  if (!found.ok) throw new AppError(found.reason === "expired" ? "This invite has expired. Ask for a new one." : found.reason === "used" ? "This invite was already used." : "Invite not found.", 410, "INVITE_INVALID");
  const inv = found.invite;
  if (inv.email.toLowerCase() !== args.email.trim().toLowerCase()) throw new AppError(`This invite is for ${inv.email}. Sign in with that email to accept it.`, 403, "FORBIDDEN");
  const nowIso = args.now.toISOString();
  // Burn the token first so a double-submit can't grant twice.
  await store.update("gym_invites", inv.id, { accepted_at: nowIso, accepted_by: args.userId });
  const mine = await store.list("gym_users", { where: { gym_id: inv.gym_id, user_id: args.userId } });
  if (!mine.some((r) => r.role === inv.role)) {
    await store.insert("gym_users", { gym_id: inv.gym_id, user_id: args.userId, role: inv.role, coach_id: inv.coach_id, member_id: null, location_ids: null, invited_email: inv.email, created_at: nowIso });
  }
  if (inv.coach_id) {
    const coach = await store.get("coaches", inv.coach_id);
    if (coach && !coach.user_id) await store.update("coaches", coach.id, { user_id: args.userId });
  }
  await store.insert("audit_log", { gym_id: inv.gym_id, actor_user_id: args.userId, actor_label: inv.email, action: "invite.accepted", entity: "gym_invites", entity_id: inv.id, details: { role: inv.role }, created_at: nowIso });
  return { gymId: inv.gym_id, role: inv.role };
}
