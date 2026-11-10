import { expandSeries } from "@/lib/domain/recurrence";
import type { ClassSession, ClassType, LessonType, Member } from "@/lib/data/types";
import type { SeedBuilder } from "./builder";
import { DEMO_COACH_IDS, DEMO_GYM_ID, DEMO_LOCATION_2_ID, DEMO_LOCATION_ID, DEMO_MEMBER_ID } from "./constants";
import type { GymSeed } from "./gym";

export interface ScheduleSeed {
  classTypes: Record<string, ClassType>;
  sessions: ClassSession[];
  lessonTypes: LessonType[];
}

type Slot = [type: string, weekday: number, time: string, coach: string, room: keyof GymSeed["rooms"], cap?: number];

export function seedSchedule(b: SeedBuilder, gs: GymSeed): ScheduleSeed {
  const g = DEMO_GYM_ID;
  const created = b.iso(300);
  const ct = (key: string, name: string, discipline: string, color: string, patch: Partial<ClassType> = {}) => [key, b.add("class_types", {
    id: b.id(), gym_id: g, discipline_id: discipline, name, description: null, color, default_capacity: 30, duration_min: 60,
    is_kids: false, age_min: null, age_max: null, allow_drop_in: true, drop_in_price_cents: 2500, allow_trial: true,
    requires_rank_order: null, created_at: created, ...patch,
  })] as const;
  const d = gs.disciplines;
  const classTypes = Object.fromEntries([
    ct("fund", "BJJ Fundamentals", d.bjj, "#3b82f6", { description: "Core positions, escapes and submissions. Great first class." }),
    ct("adv", "BJJ Advanced", d.bjj, "#1d4ed8", { description: "Blue belt and up. Technique + positional sparring.", requires_rank_order: 2, allow_trial: false }),
    ct("nogi", "No-Gi Grappling", d.bjj, "#0ea5e9"),
    ct("mt", "Muay Thai", d.muay_thai, "#16a34a", { description: "Stance, strikes, clinch and pad rounds. All levels." }),
    ct("mma", "MMA", d.mma, "#dc2626", { duration_min: 90, description: "Putting it together: striking, wrestling, cage work." }),
    ct("boxing", "Boxing Conditioning", d.boxing, "#f59e0b", { default_capacity: 20 }),
    ct("kids_little", "Kids BJJ (5–8)", d.kids, "#a855f7", { is_kids: true, age_min: 5, age_max: 8, duration_min: 45, default_capacity: 16 }),
    ct("kids_big", "Kids BJJ (9–13)", d.kids, "#9333ea", { is_kids: true, age_min: 9, age_max: 13, default_capacity: 20 }),
    ct("open", "Open Mat", d.bjj, "#64748b", { allow_drop_in: true, drop_in_price_cents: 1500, allow_trial: false }),
    ct("comp", "Competition Team", d.mma, "#be123c", { default_capacity: 8, allow_drop_in: false, allow_trial: false, requires_rank_order: 2, description: "Invite only. Hard rounds, fight prep." }),
  ]) as Record<string, ClassType>;

  const R = DEMO_COACH_IDS.rafael, N = DEMO_COACH_IDS.nina;
  const slots: Slot[] = [
    ["fund", 1, "06:30", R, "mat1"], ["fund", 3, "06:30", R, "mat1"], ["fund", 5, "06:30", R, "mat1"],
    ["fund", 1, "18:00", R, "mat1"], ["fund", 3, "18:00", R, "mat1"], ["adv", 2, "19:00", R, "mat1"], ["adv", 4, "19:00", R, "mat1"],
    ["nogi", 5, "18:00", R, "mat1"], ["mt", 1, "19:15", N, "mat2"], ["mt", 2, "18:00", N, "mat2"], ["mt", 4, "18:00", N, "mat2"],
    ["mt", 6, "10:00", N, "mat2"], ["mma", 3, "19:15", N, "cage", 12], ["mma", 6, "11:30", R, "cage", 12],
    ["kids_little", 2, "16:30", N, "mat1"], ["kids_little", 4, "16:30", N, "mat1"], ["kids_big", 2, "17:15", R, "mat1"],
    ["kids_big", 4, "17:15", R, "mat1"], ["kids_little", 6, "09:00", N, "north"], ["open", 0, "11:00", R, "mat1"],
    ["comp", 5, "19:00", R, "cage", 8], ["boxing", 1, "12:00", N, "ring", 10],
  ];

  const tz = "America/New_York";
  const from = b.date(21), to = b.date(-14);
  const sessions: ClassSession[] = [];
  for (const [key, weekday, time, coach, roomKey, cap] of slots) {
    const type = classTypes[key];
    const capacity = cap ?? type.default_capacity;
    const series = b.add("class_series", {
      id: b.id(), gym_id: g, class_type_id: type.id, location_id: roomKey === "north" ? DEMO_LOCATION_2_ID : DEMO_LOCATION_ID,
      room_id: gs.rooms[roomKey], coach_id: coach, weekday, start_time: time, duration_min: type.duration_min, capacity,
      starts_on: b.date(200), ends_on: null, is_active: true, created_at: created,
    });
    for (const occ of expandSeries({ id: series.id, weekday, startTime: time, durationMin: type.duration_min, startsOn: series.starts_on, endsOn: null }, from, to, tz)) {
      sessions.push(b.add("class_sessions", {
        id: b.id(), gym_id: g, series_id: series.id, class_type_id: type.id, location_id: series.location_id, room_id: series.room_id,
        coach_id: coach, starts_at: occ.startsAt.toISOString(), ends_at: occ.endsAt.toISOString(), capacity, is_cancelled: false, notes: null, created_at: created,
      }));
    }
  }

  seedAttendance(b, gs, classTypes, sessions);

  const avail = (coach: string, weekday: number, start: string, end: string) =>
    b.add("coach_availability", { id: b.id(), gym_id: g, coach_id: coach, weekday, start_time: start, end_time: end, location_id: DEMO_LOCATION_ID });
  [1, 2, 3, 4, 5].forEach((wd) => avail(R, wd, "10:00", "15:00"));
  [1, 3, 5].forEach((wd) => avail(N, wd, "12:00", "17:00"));
  avail(N, 6, "12:00", "15:00");
  [1, 2, 3, 4].forEach((wd) => avail(DEMO_COACH_IDS.marcus, wd, "07:00", "11:00"));
  [2, 4].forEach((wd) => avail(DEMO_COACH_IDS.marcus, wd, "13:00", "17:00"));
  b.add("coach_time_off", { id: b.id(), gym_id: g, coach_id: N, starts_at: b.iso(-9, 0), ends_at: b.iso(-11, 23), reason: "Cornering at Fight Night 42" });

  const lt = (coach: string | null, name: string, duration: number, price: number, patch: Partial<LessonType> = {}) => b.add("lesson_types", {
    id: b.id(), gym_id: g, coach_id: coach, name, description: null, duration_min: duration, price_cents: price, max_participants: 1,
    per_person_price_cents: null, buffer_before_min: 0, buffer_after_min: 10, room_kinds: ["mat"], is_intro: false, is_active: true, created_at: created, ...patch,
  });
  const lessonTypes = [
    lt(R, "Private BJJ (60 min)", 60, 12000),
    lt(R, "Private BJJ (30 min)", 30, 7000),
    lt(R, "Partner Private (60 min)", 60, 14000, { max_participants: 2, per_person_price_cents: 7000, description: "Bring a training partner. Priced per person." }),
    lt(R, "$60 Intro Private", 60, 6000, { is_intro: true, description: "First-timers: a 1-on-1 intro, then pick your plan." }),
    lt(N, "Private Muay Thai (60 min)", 60, 10000, { room_kinds: ["mat", "ring"] }),
    lt(N, "Private Muay Thai (45 min)", 45, 8500, { room_kinds: ["mat", "ring"] }),
    lt(N, "$60 Intro Private", 60, 6000, { is_intro: true, room_kinds: ["mat", "ring"] }),
    lt(DEMO_COACH_IDS.marcus, "Boxing Private (60 min)", 60, 9000, { room_kinds: ["ring"], buffer_after_min: 15 }),
    lt(DEMO_COACH_IDS.marcus, "Boxing Private (30 min)", 30, 5500, { room_kinds: ["ring"] }),
    lt(DEMO_COACH_IDS.marcus, "Small Group Boxing (60 min)", 60, 16000, { max_participants: 4, per_person_price_cents: 4000, room_kinds: ["ring"], description: "2–4 people. Priced per person." }),
  ];
  return { classTypes, sessions, lessonTypes };
}

function ageOf(m: Member, now: Date): number {
  return m.date_of_birth ? Math.floor((now.getTime() - new Date(m.date_of_birth).getTime()) / (365.25 * 86_400_000)) : 30;
}

function seedAttendance(b: SeedBuilder, gs: GymSeed, types: Record<string, ClassType>, sessions: ClassSession[]): void {
  const now = b.now;
  const activeAdults = gs.adults.filter((m) => ["active", "past_due", "trial"].includes(m.status));
  // Members 18-21 drifted away: no visits in the last 12 days (retention alerts).
  const drifting = new Set(gs.adults.slice(18, 22).map((m) => m.id));
  const lastSeen = new Map<string, string>();
  const typeById = new Map(Object.values(types).map((t) => [t.id, t]));

  for (const s of sessions) {
    const type = typeById.get(s.class_type_id)!;
    const start = new Date(s.starts_at);
    const isPast = start < now;
    const pool = type.is_kids
      ? gs.kids.filter((k) => { const a = ageOf(k, now); return a >= (type.age_min ?? 0) && a <= (type.age_max ?? 99); })
      : activeAdults.filter((m) => !(drifting.has(m.id) && now.getTime() - start.getTime() < 12 * 86_400_000));
    const fillRatio = isPast ? 0.35 + b.rng.next() * 0.4 : type.default_capacity <= 12 ? 1.2 : 0.15 + b.rng.next() * 0.3;
    const want = Math.min(pool.length, Math.round(s.capacity * fillRatio) + (type.default_capacity <= 12 && !isPast ? 2 : 0));
    const chosen = [...pool].sort(() => b.rng.next() - 0.5).slice(0, want);
    if (!isPast && s.class_type_id === types.fund.id && !chosen.some((m) => m.id === DEMO_MEMBER_ID)) {
      const alex = gs.adults.find((m) => m.id === DEMO_MEMBER_ID);
      if (alex) chosen.unshift(alex);
    }
    let booked = 0;
    let waitPos = 0;
    for (const m of chosen) {
      const full = booked >= s.capacity;
      if (isPast && full) break;
      const status = isPast ? (b.rng.chance(0.06) ? "no_show" : "attended") : full ? "waitlisted" : "booked";
      b.add("class_bookings", {
        id: b.id(), gym_id: s.gym_id, session_id: s.id, member_id: m.id, status, waitlist_position: full ? ++waitPos : null,
        is_trial: m.status === "trial", is_drop_in: false, entitlement_id: null, membership_id: null, source: b.rng.chance(0.7) ? "app" : "front_desk",
        cancelled_at: null, fee_cents: 0, created_at: new Date(start.getTime() - b.rng.int(1, 72) * 3_600_000).toISOString(),
      });
      if (!full) booked++;
      if (status === "attended") {
        const at = new Date(start.getTime() - b.rng.int(2, 15) * 60_000).toISOString();
        b.add("check_ins", { id: b.id(), gym_id: s.gym_id, member_id: m.id, session_id: s.id, location_id: s.location_id, method: b.rng.pick(["kiosk", "kiosk", "qr", "staff"] as const), checked_in_at: at, checked_in_by: null });
        if ((lastSeen.get(m.id) ?? "") < at) lastSeen.set(m.id, at);
      }
    }
  }
  b.data.members = b.data.members.map((m) => ({ ...m, last_attended_at: lastSeen.get(m.id) ?? m.last_attended_at }));
}
