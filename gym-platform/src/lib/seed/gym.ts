import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import type { Coach, Member } from "@/lib/data/types";
import type { SeedBuilder } from "./builder";
import {
  ADULT_NAMES, DEMO_COACH_IDS, DEMO_GUARDIAN_MEMBER_ID, DEMO_GYM_ID, DEMO_LOCATION_2_ID, DEMO_LOCATION_ID,
  DEMO_MEMBER_ID, DEMO_USERS, KID_NAMES,
} from "./constants";

export interface GymSeed {
  rooms: { mat1: string; mat2: string; cage: string; ring: string; north: string };
  disciplines: Record<"bjj" | "muay_thai" | "mma" | "boxing" | "kids" | "wrestling", string>;
  coaches: Coach[];
  adults: Member[];
  kids: Member[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function seedGym(b: SeedBuilder): GymSeed {
  const created = b.iso(400);
  const g = DEMO_GYM_ID;
  b.add("gyms", {
    id: g, name: "Demo MMA Academy", slug: "demo-mma", timezone: "America/New_York", currency: "usd",
    email: "hello@demo-mma.test", phone: "+15555550100", website: null, google_review_url: "https://g.page/r/demo-mma-academy/review",
    logo_path: null, brand_color: "#e11d48", platform_fee_bps: 300, stripe_account_id: "acct_demo_gym",
    stripe_charges_enabled: true, stripe_payouts_enabled: true, onboarding_step: "done", is_public: true,
    settings: DEFAULT_SETTINGS, created_at: created, updated_at: created,
  });
  b.add("locations", { id: DEMO_LOCATION_ID, gym_id: g, name: "Downtown", address: "120 Main St", city: "Springfield", region: "NJ", postal: "07081", is_primary: true, created_at: created });
  b.add("locations", { id: DEMO_LOCATION_2_ID, gym_id: g, name: "Northside", address: "48 Elm Ave", city: "Springfield", region: "NJ", postal: "07081", is_primary: false, created_at: created });
  const room = (name: string, kind: "mat" | "cage" | "ring", loc = DEMO_LOCATION_ID, capacity = 30) =>
    b.add("rooms", { id: b.id(), gym_id: g, location_id: loc, name, kind, capacity, created_at: created }).id;
  const rooms = { mat1: room("Mat 1", "mat"), mat2: room("Mat 2", "mat", DEMO_LOCATION_ID, 20), cage: room("Cage", "cage", DEMO_LOCATION_ID, 12), ring: room("Ring", "ring", DEMO_LOCATION_ID, 10), north: room("North Mat", "mat", DEMO_LOCATION_2_ID, 24) };

  const disc = (name: string) => b.add("disciplines", { id: b.id(), gym_id: g, name, slug: slug(name), created_at: created }).id;
  const disciplines = { bjj: disc("Brazilian Jiu-Jitsu"), muay_thai: disc("Muay Thai"), mma: disc("MMA"), boxing: disc("Boxing"), kids: disc("Kids Martial Arts"), wrestling: disc("Wrestling") };

  const coach = (id: string, user: { id: string; name: string; email: string }, patch: Partial<Coach>): Coach =>
    b.add("coaches", {
      id, gym_id: g, user_id: user.id, display_name: user.name, slug: slug(user.name), email: user.email, phone: null,
      bio: null, specialties: [], photo_path: null, color: "#6366f1", employment: "staff", default_coach_split_bps: 7000,
      rent_model: "none", rent_amount_cents: 0, stripe_account_id: null, stripe_payouts_enabled: false, accepts_privates: true,
      is_active: true, created_at: created, ...patch,
    });
  const coaches = [
    coach(DEMO_COACH_IDS.rafael, DEMO_USERS.head_coach, {
      bio: "Head coach. BJJ black belt, 3rd degree. Runs the competition team and the adult curriculum.",
      specialties: ["BJJ", "No-Gi", "Competition prep"], color: "#2563eb", default_coach_split_bps: 6000,
      stripe_account_id: "acct_demo_rafael", stripe_payouts_enabled: true,
    }),
    coach(DEMO_COACH_IDS.nina, DEMO_USERS.coach, {
      bio: "Muay Thai and kickboxing. Former amateur champion. Teaches fundamentals and the fight team's striking.",
      specialties: ["Muay Thai", "Kickboxing", "Clinch"], color: "#16a34a", default_coach_split_bps: 6500,
      stripe_account_id: "acct_demo_nina", stripe_payouts_enabled: true,
    }),
    coach(DEMO_COACH_IDS.marcus, DEMO_USERS.independent_coach, {
      bio: "Independent boxing coach. Private and partner sessions for all levels. Rents ring time at Demo MMA.",
      specialties: ["Boxing", "Footwork", "Pad work"], color: "#f59e0b", employment: "independent",
      default_coach_split_bps: 8500, rent_model: "flat_monthly", rent_amount_cents: 35000,
      stripe_account_id: "acct_demo_marcus", stripe_payouts_enabled: true,
    }),
  ];

  const families = new Map<string, string>();
  const familyFor = (last: string) => {
    if (!families.has(last)) families.set(last, b.add("families", { id: b.id(), gym_id: g, name: `${last} family`, billing_member_id: null, created_at: created }).id);
    return families.get(last)!;
  };

  const member = (first: string, last: string, opts: Partial<Member>): Member => {
    const joinedDaysAgo = b.rng.int(20, 700);
    return b.add("members", {
      id: b.id(), gym_id: g, user_id: null, family_id: null, home_location_id: DEMO_LOCATION_ID, first_name: first, last_name: last,
      email: `${slug(first)}.${slug(last)}@demo-mma.test`, phone: `+1555555${String(b.rng.int(1000, 9999))}`,
      date_of_birth: `${b.rng.int(1978, 2004)}-0${b.rng.int(1, 9)}-1${b.rng.int(0, 9)}`, status: "active",
      emergency_contact: null, medical_notes: null, pickup_notes: null, notes: null, tags: [], stripe_customer_id: null,
      external_ref: b.rng.chance(0.7) ? `MB-${b.rng.int(10000, 99999)}` : null, joined_on: b.date(joinedDaysAgo),
      last_attended_at: null, sms_opt_in: true, email_opt_in: true, created_at: b.iso(joinedDaysAgo), updated_at: b.iso(joinedDaysAgo), ...opts,
    });
  };

  const statuses = ["active", "active", "active", "active", "active", "active", "frozen", "past_due", "cancelled", "trial"] as const;
  const kidParents = new Set(KID_NAMES.map(([, l]) => l));
  const adults = ADULT_NAMES.map(([first, last], i) => {
    const special = i === 0 ? { id: DEMO_MEMBER_ID, user_id: DEMO_USERS.member.id, email: DEMO_USERS.member.email, status: "active" as const }
      : i === 1 ? { id: DEMO_GUARDIAN_MEMBER_ID, user_id: DEMO_USERS.guardian.id, email: DEMO_USERS.guardian.email, status: "active" as const } : {};
    const status = i < 22 ? "active" : statuses[i % statuses.length];
    return member(first, last, {
      status, family_id: kidParents.has(last) ? familyFor(last) : null, tags: i % 7 === 0 ? ["competitor"] : [],
      notes: i === 3 ? "Shoulder surgery 2025. No heavy shoulder locks." : null, ...special,
    });
  });
  const kids = KID_NAMES.map(([first, last]) => {
    const year = b.now.getUTCFullYear() - b.rng.int(5, 13);
    return member(first, last, {
      email: null, phone: null, date_of_birth: `${year}-0${b.rng.int(1, 9)}-1${b.rng.int(0, 9)}`, family_id: familyFor(last),
      pickup_notes: b.rng.chance(0.5) ? "Picked up by parent only. Grandma Tues/Thu." : "Usually walks out with older sibling.",
      medical_notes: b.rng.chance(0.2) ? "Mild asthma. Inhaler in bag." : null,
    });
  });

  for (const kid of kids) {
    const parent = adults.find((a) => a.last_name === kid.last_name);
    if (!parent) continue;
    b.add("guardians", {
      id: b.id(), gym_id: g, child_member_id: kid.id, guardian_member_id: parent.id, guardian_user_id: parent.user_id,
      full_name: `${parent.first_name} ${parent.last_name}`, relationship: "parent", email: parent.email, phone: parent.phone,
      can_pickup: true, is_primary: true, created_at: created,
    });
    b.add("guardians", {
      id: b.id(), gym_id: g, child_member_id: kid.id, guardian_member_id: null, guardian_user_id: null,
      full_name: `Grandparent ${kid.last_name}`, relationship: "grandparent", email: null, phone: `+1555555${b.rng.int(1000, 9999)}`,
      can_pickup: true, is_primary: false, created_at: created,
    });
  }
  for (const [last, famId] of families) {
    const payer = adults.find((a) => a.last_name === last);
    if (payer) b.data.families = b.data.families.map((f) => (f.id === famId ? { ...f, billing_member_id: payer.id } : f));
  }

  const roleRows: [keyof typeof DEMO_USERS, string | null, string | null][] = [
    ["owner", null, null], ["manager", null, null], ["front_desk", null, null], ["head_coach", DEMO_COACH_IDS.rafael, null],
    ["coach", DEMO_COACH_IDS.nina, null], ["independent_coach", DEMO_COACH_IDS.marcus, null], ["member", null, DEMO_MEMBER_ID],
    ["guardian", null, DEMO_GUARDIAN_MEMBER_ID],
  ];
  for (const [role, coachId, memberId] of roleRows) {
    b.add("gym_users", { id: b.id(), gym_id: g, user_id: DEMO_USERS[role].id, role, coach_id: coachId, member_id: memberId, location_ids: null, invited_email: DEMO_USERS[role].email, created_at: created });
  }
  b.add("gym_users", { id: b.id(), gym_id: g, user_id: DEMO_USERS.guardian.id, role: "member", coach_id: null, member_id: DEMO_GUARDIAN_MEMBER_ID, location_ids: null, invited_email: null, created_at: created });

  return { rooms, disciplines, coaches, adults, kids };
}
