import { z } from "zod";
import type { Member } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";
import { chargeAndSplit } from "./checkout";
import { rankViews } from "./ranks";
import { waiverStatus } from "./waivers";
import { emitWebhook } from "./webhooks";

export const memberSchema = z.object({
  firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")), phone: z.string().trim().max(20).optional().or(z.literal("")),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), status: z.enum(["lead", "trial", "active", "frozen", "past_due", "cancelled"]).default("active"),
  notes: z.string().max(2000).optional(), pickupNotes: z.string().max(500).optional(), medicalNotes: z.string().max(1000).optional(),
});

export async function saveMember(ctx: Ctx, input: z.input<typeof memberSchema> & { id?: string }): Promise<Member> {
  const a = memberSchema.parse(input);
  const row = { first_name: a.firstName, last_name: a.lastName, email: a.email || null, phone: a.phone || null, date_of_birth: a.dateOfBirth || null, status: a.status, notes: a.notes ?? null, pickup_notes: a.pickupNotes ?? null, medical_notes: a.medicalNotes ?? null, updated_at: ctx.now().toISOString() };
  if (a.email) {
    const dup = await ctx.store.first("members", { where: { gym_id: ctx.gym.id, email: a.email } });
    if (dup && dup.id !== input.id) throw new AppError("Another member already uses that email.");
  }
  if (input.id) {
    await mustGet(ctx, "members", input.id);
    return ctx.store.update("members", input.id, row);
  }
  const m = await ctx.store.insert("members", { gym_id: ctx.gym.id, ...row, created_at: ctx.now().toISOString() });
  await emitWebhook(ctx, "member.created", { member_id: m.id });
  return m;
}

/** Everything the member profile page shows, in one call. */
export async function memberProfile(ctx: Ctx, memberId: string) {
  const member = await mustGet(ctx, "members", memberId);
  const [memberships, ents, txns, bookings, checkins, guardians, products, threads, refunds, holds] = await Promise.all([
    ctx.store.list("memberships", { where: { member_id: memberId } }),
    ctx.store.list("entitlements", { where: { member_id: memberId } }),
    ctx.store.list("transactions", { where: { member_id: memberId }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("class_bookings", { where: { member_id: memberId }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("check_ins", { where: { member_id: memberId }, order: { column: "checked_in_at", ascending: false } }),
    ctx.store.list("guardians", { where: { child_member_id: memberId } }),
    ctx.store.list("products", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("message_threads", { where: { member_id: memberId } }),
    ctx.store.list("refunds", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("membership_holds", { where: { gym_id: ctx.gym.id } }),
  ]);
  const messages = threads.length ? await ctx.store.list("messages", { where: { thread_id: { in: threads.map((t) => t.id) } }, order: { column: "created_at" } }) : [];
  const children = await ctx.store.list("guardians", { where: { guardian_member_id: memberId } });
  return {
    member, memberships, entitlements: ents, transactions: txns, bookings, checkins, guardians, products, threads, messages,
    refunds: refunds.filter((r) => txns.some((t) => t.id === r.transaction_id)), holds: holds.filter((h) => memberships.some((m) => m.id === h.membership_id)),
    ranks: (await rankViews(ctx, [memberId])).get(memberId) ?? [], waivers: await waiverStatus(ctx, memberId), children,
  };
}

export async function freezeMembership(ctx: Ctx, input: { membershipId: string; startsOn: string; endsOn: string; reason?: string }) {
  const ms = await mustGet(ctx, "memberships", input.membershipId);
  if (input.endsOn < input.startsOn) throw new AppError("Hold must end after it starts.");
  await ctx.store.insert("membership_holds", { gym_id: ctx.gym.id, membership_id: ms.id, starts_on: input.startsOn, ends_on: input.endsOn, reason: input.reason ?? null, fee_cents: 0, created_at: ctx.now().toISOString() });
  const days = Math.round((new Date(input.endsOn).getTime() - new Date(input.startsOn).getTime()) / 86_400_000);
  const end = new Date(new Date(ms.current_period_end).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  await ctx.store.update("memberships", ms.id, { status: "frozen", current_period_end: end });
  await ctx.store.update("members", ms.member_id, { status: "frozen" });
  await audit(ctx, "membership.frozen", "memberships", ms.id, { days });
}

// ---------------------------------------------------------------- POS
export const posSchema = z.object({ memberId: z.string().uuid().nullable(), lines: z.array(z.object({ itemId: z.string().uuid(), qty: z.number().int().min(1).max(50) })).min(1).max(30) });

export async function posSale(ctx: Ctx, input: z.input<typeof posSchema>) {
  const a = posSchema.parse(input);
  const items = await Promise.all(a.lines.map(async (l) => ({ item: await mustGet(ctx, "inventory_items", l.itemId), qty: l.qty })));
  for (const { item, qty } of items) if (item.stock < qty) throw new AppError(`Only ${item.stock} ${item.name} left.`);
  const member = a.memberId ? await mustGet(ctx, "members", a.memberId) : null;
  const total = items.reduce((s, x) => s + x.item.price_cents * x.qty, 0);
  const txn = await chargeAndSplit(ctx, { member, coach: null, product: null, totalCents: total, description: `POS: ${items.map((x) => `${x.qty}× ${x.item.name}`).join(", ")}`, items: items.map((x) => ({ name: x.item.name, quantity: x.qty, unit_price_cents: x.item.price_cents, inventory_item_id: x.item.id })), paymentMethodId: member ? undefined : "pm_card_present" });
  if (txn.status === "succeeded") for (const { item, qty } of items) await ctx.store.update("inventory_items", item.id, { stock: item.stock - qty });
  return txn;
}

// ---------------------------------------------------------------- coaches
export async function coachDashboard(ctx: Ctx, coachId: string) {
  const coach = await mustGet(ctx, "coaches", coachId);
  const [privates, ents, splits, payouts, rent, lessonTypes, products, classes] = await Promise.all([
    ctx.store.list("private_bookings", { where: { coach_id: coachId }, order: { column: "starts_at" } }),
    ctx.store.list("entitlements", { where: { coach_id: coachId } }),
    ctx.store.list("splits", { where: { coach_id: coachId } }),
    ctx.store.list("payouts", { where: { coach_id: coachId }, order: { column: "arrival_date", ascending: false } }),
    ctx.store.list("mat_rent_charges", { where: { coach_id: coachId } }),
    ctx.store.list("lesson_types", { where: { coach_id: coachId } }),
    ctx.store.list("products", { where: { coach_id: coachId } }),
    ctx.store.list("class_sessions", { where: { coach_id: coachId }, order: { column: "starts_at" } }),
  ]);
  const parts = privates.length ? await ctx.store.list("private_booking_participants", { where: { booking_id: { in: privates.map((p) => p.id) } } }) : [];
  const clientIds = [...new Set([...parts.map((p) => p.member_id), ...ents.map((e) => e.member_id)])];
  const clients = clientIds.length ? await ctx.store.list("members", { where: { id: { in: clientIds } } }) : [];
  const now = ctx.now().toISOString();
  const month = now.slice(0, 7);
  const txnIds = splits.map((s) => s.transaction_id);
  const txns = txnIds.length ? await ctx.store.list("transactions", { where: { id: { in: txnIds } } }) : [];
  const gymSplits = txnIds.length ? (await ctx.store.list("splits", { where: { transaction_id: { in: txnIds }, party: "gym" } })) : [];
  const net = (s: { amount_cents: number; reversed_cents: number }) => s.amount_cents - s.reversed_cents;
  return {
    coach, lessonTypes, products, clients, payouts, rent, txns,
    upcoming: privates.filter((p) => p.starts_at >= now && p.status === "confirmed").map((p) => ({ ...p, participants: parts.filter((x) => x.booking_id === p.id) })),
    upcomingClasses: classes.filter((c) => c.starts_at >= now).slice(0, 8),
    packages: ents.filter((e) => e.status === "active"),
    earnedThisMonth: splits.filter((s) => txns.find((t) => t.id === s.transaction_id)?.created_at.startsWith(month)).reduce((a, s) => a + net(s), 0),
    earnedTotal: splits.reduce((a, s) => a + net(s), 0),
    gymShareTotal: gymSplits.reduce((a, s) => a + net(s), 0),
    nextPayout: payouts.find((p) => p.status === "scheduled" || p.status === "in_transit") ?? null,
    rentDue: rent.filter((r) => r.status === "pending").reduce((a, r) => a + r.amount_cents, 0),
  };
}

// ---------------------------------------------------------------- fight team
export function fightRecord(fights: { result: string | null; level: string }[], level?: "amateur" | "pro") {
  const f = fights.filter((x) => x.result && (!level || x.level === level));
  const c = (r: string) => f.filter((x) => x.result === r).length;
  return { w: c("win"), l: c("loss"), d: c("draw"), nc: c("nc"), text: `${c("win")}-${c("loss")}-${c("draw")}` };
}

// ---------------------------------------------------------------- card migration
/** Match imported processor customers to members by email, then attach. */
export async function matchCardMigration(ctx: Ctx, migrationId: string) {
  const mig = await mustGet(ctx, "card_migrations", migrationId);
  const recs = await ctx.store.list("card_migration_records", { where: { migration_id: mig.id } });
  const members = await ctx.store.list("members", { where: { gym_id: ctx.gym.id } });
  let attached = 0;
  for (const r of recs.filter((x) => x.status === "pending" || x.status === "unmatched")) {
    const m = members.find((x) => x.email && x.email === r.email?.toLowerCase());
    if (!m) { await ctx.store.update("card_migration_records", r.id, { status: "unmatched" }); continue; }
    await ctx.store.update("card_migration_records", r.id, { status: "attached", matched_member_id: m.id });
    if (r.stripe_payment_method_id) await ctx.store.insert("payment_methods", { gym_id: ctx.gym.id, member_id: m.id, stripe_payment_method_id: r.stripe_payment_method_id, brand: null, last4: null, exp_month: null, exp_year: null, is_default: true, source: "migrated", created_at: ctx.now().toISOString() });
    attached++;
  }
  const all = await ctx.store.list("card_migration_records", { where: { migration_id: mig.id } });
  const imported = all.filter((x) => x.status === "attached").length;
  const unmatched = all.filter((x) => x.status === "unmatched").length;
  await ctx.store.update("card_migrations", mig.id, { cards_imported: imported, cards_unmatched: unmatched, status: unmatched === 0 ? "completed" : "mapping", completed_at: unmatched === 0 ? ctx.now().toISOString() : null });
  return { attached, unmatched };
}
