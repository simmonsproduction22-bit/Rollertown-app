import type { Dataset } from "@/lib/data/memory-store";
import type { TableName, Tables } from "@/lib/data/types";

/** Deterministic PRNG (mulberry32) so demo data is identical on every boot. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    uuid: () => {
      const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16)).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[Math.floor(next() * 4)]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    },
  };
}
export type Rng = ReturnType<typeof makeRng>;

export const TABLE_ORDER: readonly TableName[] = [
  "gyms", "locations", "rooms", "disciplines", "families", "members", "guardians", "coaches", "gym_users",
  "class_types", "class_series", "class_sessions", "coach_availability", "coach_time_off", "lesson_types",
  "products", "memberships", "membership_holds", "transactions", "transaction_items", "splits", "refunds", "payouts",
  "entitlements", "credit_ledger", "payment_methods", "class_bookings", "check_ins", "private_bookings",
  "private_booking_participants", "mat_rent_charges", "dunning_attempts", "card_migrations", "card_migration_records",
  "inventory_items", "waiver_templates", "waiver_signatures", "rank_systems", "ranks", "member_ranks", "promotions",
  "techniques", "testing_events", "testing_registrations", "fighters", "fight_events", "fights", "weigh_ins",
  "fight_camps", "fighter_documents", "leads", "lead_forms", "message_threads", "messages", "automations",
  "automation_runs", "notifications_outbox", "import_jobs", "api_keys", "webhook_endpoints", "webhook_deliveries", "audit_log",
];

export function emptyDataset(): Dataset {
  return Object.fromEntries(TABLE_ORDER.map((t) => [t, []])) as unknown as Dataset;
}

/** Small mutable builder used only while generating seed data. */
export class SeedBuilder {
  readonly data: Dataset = emptyDataset();
  constructor(readonly rng: Rng, readonly now: Date) {}

  add<N extends TableName>(table: N, row: Tables[N]): Tables[N] {
    (this.data[table] as Tables[N][]).push(row);
    return row;
  }

  id(): string {
    return this.rng.uuid();
  }

  daysAgo(days: number, hour = 12): Date {
    const d = new Date(this.now.getTime() - days * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  }

  iso(days: number, hour = 12): string {
    return this.daysAgo(days, hour).toISOString();
  }

  date(days: number): string {
    return this.daysAgo(days).toISOString().slice(0, 10);
  }
}
