import { computeSplits } from "@/lib/domain/splits";
import { computeRefundReversal } from "@/lib/domain/refunds";
import type { Coach, Entitlement, Member, Product, Transaction } from "@/lib/data/types";
import type { SeedBuilder } from "./builder";
import { DEMO_COACH_IDS, DEMO_GYM_ID, DEMO_LOCATION_ID, DEMO_MEMBER_ID, DEMO_USERS } from "./constants";
import type { GymSeed } from "./gym";
import type { ScheduleSeed } from "./schedule";

const g = DEMO_GYM_ID;
let receiptSeq = 1000;

function sale(b: SeedBuilder, args: {
  member: Member | null; product: Product | null; description: string; totalCents: number; daysAgo: number;
  coach?: Coach | null; status?: Transaction["status"]; membershipId?: string | null; items?: { name: string; qty: number; unit: number; inventoryId?: string }[];
}): Transaction {
  const coach = args.coach ?? null;
  const status = args.status ?? "succeeded";
  const splitBps = args.product?.coach_split_bps ?? coach?.default_coach_split_bps;
  const lines = computeSplits({ totalCents: args.totalCents, platformFeeBps: 300, coachId: coach?.id ?? null, coachSplitBps: splitBps });
  const txnId = b.id();
  const created = b.iso(args.daysAgo, 15);
  const txn = b.add("transactions", {
    id: txnId, gym_id: g, member_id: args.member?.id ?? null, coach_id: coach?.id ?? null, product_id: args.product?.id ?? null,
    membership_id: args.membershipId ?? null, description: args.description, subtotal_cents: args.totalCents, discount_cents: 0,
    platform_fee_cents: lines[0].amountCents, total_cents: args.totalCents, refunded_cents: 0, status,
    payer_email: args.member?.email ?? null, stripe_payment_intent_id: `pi_demo_${txnId.slice(0, 8)}`, stripe_charge_id: `ch_demo_${txnId.slice(0, 8)}`,
    transfer_group: `txn_${txnId}`, failure_reason: status === "failed" ? "card_declined: insufficient_funds" : null,
    attempt_count: status === "failed" ? 2 : 1, next_retry_at: status === "failed" ? b.iso(-2, 15) : null,
    receipt_number: `R-${receiptSeq++}`, created_at: created,
  });
  for (const it of args.items ?? [{ name: args.description, qty: 1, unit: args.totalCents }]) {
    b.add("transaction_items", { id: b.id(), gym_id: g, transaction_id: txnId, product_id: args.product?.id ?? null, inventory_item_id: it.inventoryId ?? null, name: it.name, quantity: it.qty, unit_price_cents: it.unit });
  }
  if (status !== "failed") {
    for (const l of lines) {
      b.add("splits", { id: b.id(), gym_id: g, transaction_id: txnId, party: l.party, coach_id: l.coachId, amount_cents: l.amountCents, reversed_cents: 0, stripe_transfer_id: l.party === "platform" ? null : `tr_demo_${b.id().slice(0, 8)}`, payout_id: null, created_at: created });
    }
  }
  return txn;
}

export function seedCommerce(b: SeedBuilder, gs: GymSeed, sch: ScheduleSeed): void {
  const created = b.iso(380);
  const [rafael, nina, marcus] = gs.coaches;
  const prod = (p: Partial<Product> & Pick<Product, "kind" | "name" | "price_cents">) => b.add("products", {
    id: b.id(), gym_id: g, coach_id: null, description: null, interval: null, class_credits: null, lesson_credits: null,
    unlimited_classes: false, lesson_type_id: null, expires_after_days: null, coach_split_bps: null, family_eligible: false,
    sibling_discount_bps: 0, max_per_member: null, is_public: true, is_active: true, stripe_price_id: null, created_at: created, ...p,
  });
  const unlimited = prod({ kind: "membership", name: "Unlimited Adult", price_cents: 18900, interval: "month", unlimited_classes: true, description: "Every adult class, every day. Includes open mat." });
  const twoWeek = prod({ kind: "membership", name: "2x / Week Adult", price_cents: 14900, interval: "month", class_credits: 8, description: "8 classes per month." });
  const kidsPlan = prod({ kind: "membership", name: "Kids Program", price_cents: 12900, interval: "month", unlimited_classes: true, family_eligible: true, sibling_discount_bps: 1500, description: "Unlimited kids classes. 15% off each additional sibling." });
  const pack10 = prod({ kind: "class_pack", name: "10-Class Pack", price_cents: 20000, class_credits: 10, expires_after_days: 90 });
  const dropIn = prod({ kind: "drop_in", name: "Drop-in Class", price_cents: 2500, class_credits: 1, expires_after_days: 1 });
  prod({ kind: "intro", name: "Free Trial Class", price_cents: 0, class_credits: 1, expires_after_days: 14, max_per_member: 1, description: "One free class for first-timers." });
  const intro = prod({ kind: "intro", name: "$60 Intro Private", price_cents: 6000, lesson_credits: 1, expires_after_days: 30, max_per_member: 1, lesson_type_id: sch.lessonTypes[3].id, description: "A 1-on-1 intro session with a coach." });
  prod({ kind: "testing_fee", name: "Kids Belt Testing Fee", price_cents: 4000, is_public: false });
  const rafael5 = prod({ kind: "lesson_pack", coach_id: rafael.id, name: "Rafael: 5 Private Lessons", price_cents: 55000, lesson_credits: 5, expires_after_days: 120, lesson_type_id: sch.lessonTypes[0].id });
  const nina10 = prod({ kind: "lesson_pack", coach_id: nina.id, name: "Nina: 10 Muay Thai Privates", price_cents: 90000, lesson_credits: 10, expires_after_days: 180, lesson_type_id: sch.lessonTypes[4].id });
  const marcus5 = prod({ kind: "lesson_pack", coach_id: marcus.id, name: "Marcus: 5 Boxing Privates", price_cents: 40000, lesson_credits: 5, expires_after_days: 90, lesson_type_id: sch.lessonTypes[7].id, coach_split_bps: 8500 });
  const marcusSingle = prod({ kind: "lesson_pack", coach_id: marcus.id, name: "Marcus: Single Boxing Private", price_cents: 9000, lesson_credits: 1, expires_after_days: 60, lesson_type_id: sch.lessonTypes[7].id });

  // Payment methods (most migrated from the old system).
  for (const m of [...gs.adults]) {
    b.add("payment_methods", {
      id: b.id(), gym_id: g, member_id: m.id, stripe_payment_method_id: `pm_demo_${m.id.slice(0, 8)}`, brand: b.rng.pick(["visa", "mastercard", "amex", "discover"]),
      last4: String(b.rng.int(1000, 9999)), exp_month: b.rng.int(1, 12), exp_year: b.now.getUTCFullYear() + b.rng.int(0, 4), is_default: true,
      source: b.rng.chance(0.85) ? "migrated" : "new", created_at: created,
    });
  }

  // Memberships + 4 months of billing history.
  const kidsSeen = new Map<string, number>();
  const billable = [...gs.adults.filter((a) => a.status !== "trial"), ...gs.kids];
  billable.forEach((m, i) => {
    const isKid = gs.kids.includes(m);
    const product = isKid ? kidsPlan : i % 4 === 3 ? twoWeek : unlimited;
    const sibIdx = isKid ? kidsSeen.get(m.family_id ?? "") ?? 0 : 0;
    if (isKid) kidsSeen.set(m.family_id ?? "", sibIdx + 1);
    const discount = sibIdx > 0 ? product.sibling_discount_bps : 0;
    const price = Math.round(product.price_cents * (1 - discount / 10000));
    const status = m.status === "frozen" ? "frozen" : m.status === "past_due" ? "past_due" : m.status === "cancelled" ? "cancelled" : "active";
    const ms = b.add("memberships", {
      id: b.id(), gym_id: g, member_id: m.id, product_id: product.id, family_id: m.family_id, status, price_cents: price, discount_bps: discount,
      started_on: m.joined_on, current_period_end: b.date(-b.rng.int(3, 28)), cancel_at_period_end: i === 5 || i === 9, cancelled_on: status === "cancelled" ? b.date(40) : null,
      stripe_subscription_id: `sub_demo_${m.id.slice(0, 8)}`, failed_payment_count: status === "past_due" ? 2 : 0, created_at: m.created_at,
    });
    if (status === "frozen") b.add("membership_holds", { id: b.id(), gym_id: g, membership_id: ms.id, starts_on: b.date(10), ends_on: b.date(-20), reason: "Knee injury: cleared to return next month", fee_cents: 0, created_at: b.iso(10) });
    const months = status === "cancelled" ? 2 : 4;
    for (let k = 0; k < months; k++) {
      const daysAgo = k * 30 + (i % 27) + (status === "cancelled" ? 40 : 0);
      const failed = status === "past_due" && k === 0;
      const txn = sale(b, { member: m, product, description: `${product.name}${discount ? " (sibling discount)" : ""}`, totalCents: price, daysAgo, membershipId: ms.id, status: failed ? "failed" : "succeeded" });
      if (failed) {
        b.add("dunning_attempts", { id: b.id(), gym_id: g, transaction_id: txn.id, attempt: 1, channel: "email", outcome: "sent", created_at: b.iso(daysAgo - 1) });
        b.add("dunning_attempts", { id: b.id(), gym_id: g, transaction_id: txn.id, attempt: 1, channel: "sms", outcome: "sent", created_at: b.iso(daysAgo - 1) });
        b.add("dunning_attempts", { id: b.id(), gym_id: g, transaction_id: txn.id, attempt: 2, channel: "retry", outcome: "card_declined", created_at: b.iso(Math.max(0, daysAgo - 3)) });
      }
    }
  });

  // Packages and coach privates.
  const ent = (m: Member, p: Product, used: number, daysAgo: number, coach: Coach | null): Entitlement => {
    const txn = sale(b, { member: m, product: p, description: p.name, totalCents: p.price_cents, daysAgo, coach });
    const total = p.lesson_credits ?? p.class_credits ?? 1;
    const e = b.add("entitlements", {
      id: b.id(), gym_id: g, member_id: m.id, product_id: p.id, coach_id: p.coach_id, transaction_id: txn.id, kind: p.lesson_credits ? "lesson" : "class",
      credits_total: total, credits_used: Math.min(used, total), amount_paid_cents: p.price_cents, purchased_at: txn.created_at,
      expires_at: p.expires_after_days ? new Date(new Date(txn.created_at).getTime() + p.expires_after_days * 86_400_000).toISOString() : null,
      status: used >= total ? "exhausted" : "active", migrated: false,
    });
    b.add("credit_ledger", { gym_id: g, entitlement_id: e.id, delta: total, reason: "purchase", ref_id: txn.id, created_at: txn.created_at });
    if (used > 0) b.add("credit_ledger", { gym_id: g, entitlement_id: e.id, delta: -Math.min(used, total), reason: "booking", ref_id: null, created_at: b.iso(Math.max(0, daysAgo - 5)) });
    return e;
  };
  const A = gs.adults;
  const privates: { e: Entitlement; coach: Coach; lt: number }[] = [
    { e: ent(A[0], rafael5, 2, 25, rafael), coach: rafael, lt: 0 },
    { e: ent(A[2], rafael5, 4, 60, rafael), coach: rafael, lt: 0 },
    { e: ent(A[4], nina10, 7, 70, nina), coach: nina, lt: 4 },
    { e: ent(A[6], nina10, 9, 95, nina), coach: nina, lt: 4 },
    { e: ent(A[8], marcus5, 1, 12, marcus), coach: marcus, lt: 7 },
    { e: ent(A[10], marcus5, 3, 40, marcus), coach: marcus, lt: 7 },
    { e: ent(A[12], marcus5, 0, 3, marcus), coach: marcus, lt: 7 },
    { e: ent(A[14], marcusSingle, 0, 2, marcus), coach: marcus, lt: 7 },
  ];
  ent(A[16], pack10, 6, 45, null);
  ent(A[17], pack10, 9, 80, null);
  ent(A[24], pack10, 2, 20, null);
  ent(A[25], intro, 1, 8, null);
  ent(A[23], dropIn, 1, 6, null);

  // Refund: A[11] bought Marcus's 5-pack, used 1, moved away → prorated refund
  // of the 4 unused lessons. Splits reverse proportionally; credits removed.
  const refundEnt = ent(A[11], marcus5, 1, 30, marcus);
  const refundTxn = b.data.transactions.find((t) => t.id === refundEnt.transaction_id)!;
  const refundAmount = 32000;
  const splits = b.data.splits.filter((s) => s.transaction_id === refundTxn.id);
  const reversal = computeRefundReversal({ splits: splits.map((s) => ({ id: s.id, party: s.party, coachId: s.coach_id, amountCents: s.amount_cents, reversedCents: 0 })), totalCents: refundTxn.total_cents, refundedCents: 0, refundCents: refundAmount });
  b.data.splits = b.data.splits.map((s) => ({ ...s, reversed_cents: s.reversed_cents + (reversal.find((r) => r.splitId === s.id)?.reverseCents ?? 0) }));
  b.data.transactions = b.data.transactions.map((t) => (t.id === refundTxn.id ? { ...t, refunded_cents: refundAmount, status: "partially_refunded" } : t));
  b.data.entitlements = b.data.entitlements.map((e) => (e.id === refundEnt.id ? { ...e, credits_total: 1, amount_paid_cents: e.amount_paid_cents - refundAmount, status: "exhausted" } : e));
  const refund = b.add("refunds", { id: b.id(), gym_id: g, transaction_id: refundTxn.id, amount_cents: refundAmount, reason: "Moving out of state", credits_action: "remove", credits_changed: 4, policy_applied: "unused_prorated", was_override: false, stripe_refund_id: "re_demo_0001", created_by: DEMO_USERS.owner.id, created_at: b.iso(5) });
  b.add("credit_ledger", { gym_id: g, entitlement_id: refundEnt.id, delta: -4, reason: "refund_remove", ref_id: refund.id, created_at: b.iso(5) });
  b.add("audit_log", { gym_id: g, actor_user_id: DEMO_USERS.owner.id, actor_label: DEMO_USERS.owner.name, action: "refund.created", entity: "transactions", entity_id: refundTxn.id, details: { amount_cents: refundAmount, credits_removed: 4, policy: "unused_prorated" }, created_at: b.iso(5) });

  seedPrivateBookings(b, gs, sch, privates);

  // Retail POS sales + inventory
  const inv = (name: string, category: string, price: number, stock: number, sku: string) => b.add("inventory_items", { id: b.id(), gym_id: g, location_id: DEMO_LOCATION_ID, name, sku, category, price_cents: price, stock, low_stock_threshold: 3, is_active: true, created_at: created });
  const items = [
    inv("Boxing Gloves 16oz", "gear", 6500, 9, "GLV-16"), inv("Shin Guards", "gear", 7500, 4, "SHN-01"), inv("Academy Gi (A2)", "apparel", 12000, 2, "GI-A2"),
    inv("Rash Guard", "apparel", 5500, 11, "RG-01"), inv("Mouthguard", "gear", 1500, 25, "MG-01"), inv("Hand Wraps", "gear", 1200, 18, "HW-01"),
    inv("Water", "drinks", 200, 48, "DR-H2O"), inv("Electrolyte Drink", "drinks", 350, 30, "DR-ELY"), inv("Protein Bar", "snacks", 300, 1, "SN-PB"),
  ];
  for (let k = 0; k < 14; k++) {
    const it = b.rng.pick(items);
    const qty = it.category === "drinks" ? b.rng.int(1, 3) : 1;
    sale(b, { member: b.rng.chance(0.7) ? b.rng.pick(A) : null, product: null, description: `POS: ${it.name}`, totalCents: it.price_cents * qty, daysAgo: b.rng.int(0, 40), items: [{ name: it.name, qty, unit: it.price_cents, inventoryId: it.id }] });
  }

  // Mat rent for the independent coach, offset from payouts.
  for (let k = 1; k <= 3; k++) {
    b.add("mat_rent_charges", { id: b.id(), gym_id: g, coach_id: marcus.id, period_start: b.date(k * 30), period_end: b.date(k * 30 - 29), model: "flat_monthly", units: 1, amount_cents: 35000, status: "collected", collected_from: "payout_offset", transaction_id: null, created_at: b.iso(k * 30 - 29) });
  }
  b.add("mat_rent_charges", { id: b.id(), gym_id: g, coach_id: marcus.id, period_start: b.date(0), period_end: b.date(-29), model: "flat_monthly", units: 1, amount_cents: 35000, status: "pending", collected_from: "payout_offset", transaction_id: null, created_at: b.iso(0) });

  // Weekly payouts (last 6 weeks + next).
  for (let w = -1; w < 6; w++) {
    const status = w === -1 ? "scheduled" : w === 0 ? "in_transit" : "paid";
    b.add("payouts", { id: b.id(), gym_id: g, party: "gym", coach_id: null, amount_cents: b.rng.int(380000, 520000), status, arrival_date: b.date(w * 7 + 1), stripe_payout_id: `po_demo_g${w + 1}`, created_at: b.iso(w * 7 + 3) });
    for (const c of [rafael, nina, marcus]) {
      const amt = c.id === DEMO_COACH_IDS.marcus ? b.rng.int(18000, 42000) - (w % 4 === 0 ? 35000 : 0) : b.rng.int(9000, 30000);
      b.add("payouts", { id: b.id(), gym_id: g, party: "coach", coach_id: c.id, amount_cents: Math.max(0, amt), status, arrival_date: b.date(w * 7 + 1), stripe_payout_id: `po_demo_${c.slug}${w + 1}`, created_at: b.iso(w * 7 + 3) });
    }
  }

  // Card-on-file migration in progress.
  const mig = b.add("card_migrations", { id: b.id(), gym_id: g, source_system: "mindbody", source_processor: "Mindbody Payments (Stripe-backed)", status: "mapping", requested_at: b.iso(14), completed_at: null, cards_expected: 31, cards_imported: 27, cards_unmatched: 2, notes: "PAN export received from processor. 2 emails didn't match members.", created_at: b.iso(16) });
  A.slice(0, 31).forEach((m, i) => {
    const status = i < 27 ? "attached" : i < 29 ? "pending" : "unmatched";
    b.add("card_migration_records", { id: b.id(), gym_id: g, migration_id: mig.id, source_customer_id: `cus_old_${1000 + i}`, stripe_customer_id: status === "attached" ? `cus_demo_${m.id.slice(0, 6)}` : null, stripe_payment_method_id: status === "attached" ? `pm_demo_${m.id.slice(0, 8)}` : null, email: status === "unmatched" ? `old.address${i}@example.com` : m.email, matched_member_id: status === "unmatched" ? null : m.id, status, error: null });
  });
}

function seedPrivateBookings(b: SeedBuilder, gs: GymSeed, sch: ScheduleSeed, privates: { e: Entitlement; coach: Coach; lt: number }[]): void {
  const ringOrMat = (lt: number) => (sch.lessonTypes[lt].room_kinds.includes("ring") ? gs.rooms.ring : gs.rooms.mat2);
  privates.forEach(({ e, coach, lt }, i) => {
    const type = sch.lessonTypes[lt];
    const make = (dayOffset: number, hour: number, status: "completed" | "confirmed") => {
      const start = b.daysAgo(dayOffset, hour);
      const pb = b.add("private_bookings", { id: b.id(), gym_id: g, coach_id: coach.id, lesson_type_id: type.id, room_id: ringOrMat(lt), starts_at: start.toISOString(), ends_at: new Date(start.getTime() + type.duration_min * 60_000).toISOString(), status, booked_by_email: null, booked_by_name: null, notes: null, entitlement_id: e.id, transaction_id: e.transaction_id, cancelled_at: null, reminder_sent_at: null, created_at: b.iso(dayOffset + 3) });
      b.add("private_booking_participants", { id: b.id(), gym_id: g, booking_id: pb.id, member_id: e.member_id, price_cents: 0 });
    };
    for (let k = 0; k < Math.min(e.credits_used, 3); k++) make(5 + k * 7 + i, 15 + (i % 3), "completed");
    if (e.status === "active") make(-(1 + (i % 6)), 15 + (i % 3), "confirmed");
  });
  // Partner private: Alex + Diego with Rafael next week.
  const partner = sch.lessonTypes[2];
  const start = b.daysAgo(-4, 16);
  const pb = b.add("private_bookings", { id: b.id(), gym_id: g, coach_id: DEMO_COACH_IDS.rafael, lesson_type_id: partner.id, room_id: gs.rooms.mat2, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(), status: "confirmed", booked_by_email: null, booked_by_name: null, notes: "Working guard passing for upcoming tournament", entitlement_id: null, transaction_id: null, cancelled_at: null, reminder_sent_at: null, created_at: b.iso(2) });
  for (const mId of [DEMO_MEMBER_ID, gs.adults[2].id]) b.add("private_booking_participants", { id: b.id(), gym_id: g, booking_id: pb.id, member_id: mId, price_cents: partner.per_person_price_cents ?? 0 });
  // Email-only intro booking from the public page (no account).
  const intro = sch.lessonTypes[6];
  const s2 = b.daysAgo(-2, 17);
  b.add("private_bookings", { id: b.id(), gym_id: g, coach_id: DEMO_COACH_IDS.nina, lesson_type_id: intro.id, room_id: gs.rooms.mat2, starts_at: s2.toISOString(), ends_at: new Date(s2.getTime() + 3_600_000).toISOString(), status: "confirmed", booked_by_email: "jamie.ellis@example.com", booked_by_name: "Jamie Ellis", notes: "Booked from public page (no account)", entitlement_id: null, transaction_id: null, cancelled_at: null, reminder_sent_at: null, created_at: b.iso(1) });
}
