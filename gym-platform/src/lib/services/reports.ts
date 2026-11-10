import { totalLiability } from "@/lib/domain/liability";
import type { Ctx } from "./context";

const monthKey = (iso: string) => iso.slice(0, 7);

function lastMonths(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** All dashboard + report numbers computed from raw rows (works on both stores). */
export async function buildReports(ctx: Ctx, months = 6) {
  const now = ctx.now();
  const [txns, splits, members, memberships, checkins, ents, refunds, sessions, bookings, coaches, rent] = await Promise.all([
    ctx.store.list("transactions", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("splits", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("members", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("memberships", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("check_ins", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("entitlements", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("refunds", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("class_bookings", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("mat_rent_charges", { where: { gym_id: ctx.gym.id } }),
  ]);
  const keys = lastMonths(now, months);
  const ok = txns.filter((t) => ["succeeded", "partially_refunded", "refunded"].includes(t.status));
  const txnMonth = new Map(ok.map((t) => [t.id, monthKey(t.created_at)]));

  const revenue = keys.map((m) => {
    const s = splits.filter((x) => txnMonth.get(x.transaction_id) === m);
    const net = (p: string) => s.filter((x) => x.party === p).reduce((a, x) => a + x.amount_cents - x.reversed_cents, 0);
    const gross = ok.filter((t) => monthKey(t.created_at) === m).reduce((a, t) => a + t.total_cents, 0);
    const refunded = refunds.filter((r) => monthKey(r.created_at) === m).reduce((a, r) => a + r.amount_cents, 0);
    return { month: m, gross, refunded, gym: net("gym"), coach: net("coach"), fee: net("platform") };
  });
  const attendance = keys.map((m) => ({ month: m, checkins: checkins.filter((c) => monthKey(c.checked_in_at) === m).length }));

  const growth = keys.map((m) => {
    const end = `${m}-31`;
    const joined = members.filter((x) => monthKey(x.joined_on) === m).length;
    const cancelled = memberships.filter((x) => x.cancelled_on && monthKey(x.cancelled_on) === m).length;
    const active = memberships.filter((x) => x.started_on <= end && (!x.cancelled_on || x.cancelled_on > end)).length;
    return { month: m, joined, cancelled, active, churnRate: active ? cancelled / active : 0 };
  });

  const active = memberships.filter((m) => m.status === "active");
  const mrr = active.reduce((a, m) => a + m.price_cents, 0);
  const last30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const activeMemberIds = new Set(members.filter((m) => ["active", "past_due"].includes(m.status)).map((m) => m.id));
  const attended30 = new Set(checkins.filter((c) => c.checked_in_at >= last30).map((c) => c.member_id));
  const retention30 = activeMemberIds.size ? [...activeMemberIds].filter((id) => attended30.has(id)).length / activeMemberIds.size : 0;

  const coachPayouts = coaches.map((c) => {
    const mine = splits.filter((s) => s.coach_id === c.id);
    const earned = mine.reduce((a, s) => a + s.amount_cents - s.reversed_cents, 0);
    const gymShare = splits.filter((s) => s.party === "gym" && mine.some((m) => m.transaction_id === s.transaction_id)).reduce((a, s) => a + s.amount_cents - s.reversed_cents, 0);
    const rentDue = rent.filter((r) => r.coach_id === c.id && r.status === "pending").reduce((a, r) => a + r.amount_cents, 0);
    const rentCollected = rent.filter((r) => r.coach_id === c.id && r.status === "collected").reduce((a, r) => a + r.amount_cents, 0);
    return { coach: c, earned, gymShare, rentDue, rentCollected, sales: new Set(mine.map((s) => s.transaction_id)).size };
  });

  const liability = totalLiability(ents.map((e) => ({ creditsTotal: e.credits_total, creditsUsed: e.credits_used, amountPaidCents: e.amount_paid_cents, status: e.status })));
  const liabilityRows = ents.filter((e) => e.status === "active").map((e) => {
    const earned = Math.floor((e.amount_paid_cents * e.credits_used) / e.credits_total);
    return { entitlement: e, member: members.find((m) => m.id === e.member_id), unearned: e.amount_paid_cents - earned, earned };
  }).sort((a, b) => b.unearned - a.unearned);

  const typeCounts = new Map<string, { sessions: number; attended: number; capacity: number }>();
  for (const s of sessions.filter((x) => x.starts_at < now.toISOString() && x.starts_at >= last30)) {
    const cur = typeCounts.get(s.class_type_id) ?? { sessions: 0, attended: 0, capacity: 0 };
    const att = bookings.filter((b) => b.session_id === s.id && b.status === "attended").length;
    typeCounts.set(s.class_type_id, { sessions: cur.sessions + 1, attended: cur.attended + att, capacity: cur.capacity + s.capacity });
  }

  return {
    months: keys, revenue, attendance, growth, mrr, activeMemberships: active.length, retention30,
    totalMembers: members.length, coachPayouts, liability, liabilityRows, classFill: [...typeCounts.entries()],
    failedPayments: txns.filter((t) => t.status === "failed"), refundsTotal: refunds.reduce((a, r) => a + r.amount_cents, 0),
    feesTotal: splits.filter((s) => s.party === "platform").reduce((a, s) => a + s.amount_cents - s.reversed_cents, 0),
  };
}
export type Reports = Awaited<ReturnType<typeof buildReports>>;
