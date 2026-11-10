import type { Member, Rank, RankSystem } from "@/lib/data/types";
import type { SeedBuilder } from "./builder";
import { DEMO_COACH_IDS, DEMO_GYM_ID, DEMO_LOCATION_ID } from "./constants";
import type { GymSeed } from "./gym";

const g = DEMO_GYM_ID;

const WAIVER_V1 = `RELEASE OF LIABILITY (v1)\n\nI understand martial arts training involves physical contact and risk of injury. I voluntarily assume all risks and release Demo MMA Academy, its owners, coaches and staff from liability for injuries arising from participation, except in cases of gross negligence.`;
const WAIVER_V2 = `${WAIVER_V1.replace("(v1)", "(v2)")}\n\nMEDIA: I consent to photos/video taken during class being used on the academy's social media. I may opt out at any time by emailing the front desk.\n\nMEDICAL: I confirm I have disclosed any medical conditions that affect my ability to train safely.`;

export function seedMartialArts(b: SeedBuilder, gs: GymSeed): void {
  const created = b.iso(400);
  // Waivers: v2 is current. Some members only signed v1 → must re-sign.
  const v1 = b.add("waiver_templates", { id: b.id(), gym_id: g, title: "Liability Waiver", version: 1, body: WAIVER_V1, is_current: false, required: true, created_at: created });
  const v2 = b.add("waiver_templates", { id: b.id(), gym_id: g, title: "Liability Waiver", version: 2, body: WAIVER_V2, is_current: true, required: true, created_at: b.iso(60) });
  const sig = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><path d="M10 60 C 40 10, 70 10, 90 50 S 140 70, 170 30 S 230 20, 290 55" stroke="black" fill="none" stroke-width="3"/></svg>`;
  const signAll = [...gs.adults, ...gs.kids];
  signAll.forEach((m, i) => {
    const kid = gs.kids.includes(m);
    const parent = kid ? gs.adults.find((a) => a.last_name === m.last_name) : null;
    const signer = parent ? `${parent.first_name} ${parent.last_name}` : `${m.first_name} ${m.last_name}`;
    const tpl = i % 9 === 4 ? v1 : v2;
    b.add("waiver_signatures", { id: b.id(), gym_id: g, template_id: tpl.id, template_version: tpl.version, member_id: m.id, signer_name: signer, signer_relationship: kid ? "parent" : "self", signer_email: parent?.email ?? m.email, signature_svg: sig, ip_address: "203.0.113.10", user_agent: "Mozilla/5.0 (iPhone)", pdf_path: null, signed_at: tpl === v1 ? b.iso(200) : b.iso(b.rng.int(1, 55)) });
  });

  // Rank systems
  const sys = (name: string, style: RankSystem["style"], discipline: string, uses_stripes = true) =>
    b.add("rank_systems", { id: b.id(), gym_id: g, discipline_id: discipline, name, style, uses_stripes, created_at: created });
  const bjj = sys("BJJ Adult", "bjj", gs.disciplines.bjj);
  const kidsSys = sys("BJJ Kids", "bjj_kids", gs.disciplines.kids);
  const mt = sys("Muay Thai Prajioud", "muay_thai", gs.disciplines.muay_thai, false);
  const rank = (s: RankSystem, order: number, name: string, color: string, p: Partial<Rank>) => b.add("ranks", { id: b.id(), gym_id: g, system_id: s.id, name, color, sort_order: order, max_stripes: 4, min_classes: 0, min_months: 0, classes_per_stripe: null, months_per_stripe: null, requirements: null, ...p });
  const bjjRanks = [
    rank(bjj, 1, "White", "#f8fafc", { classes_per_stripe: 25, months_per_stripe: 2, requirements: "Shrimp, bridge, technical stand-up. Escapes from mount and side control. Closed guard basics." }),
    rank(bjj, 2, "Blue", "#2563eb", { min_classes: 150, min_months: 18, classes_per_stripe: 40, months_per_stripe: 4, requirements: "Full fundamentals curriculum. Positional sparring competency. 2 guard passes from each guard." }),
    rank(bjj, 3, "Purple", "#7c3aed", { min_classes: 300, min_months: 24, classes_per_stripe: 50, months_per_stripe: 5 }),
    rank(bjj, 4, "Brown", "#78350f", { min_classes: 400, min_months: 18, classes_per_stripe: 60, months_per_stripe: 4 }),
    rank(bjj, 5, "Black", "#0a0a0a", { min_classes: 500, min_months: 12, max_stripes: 6, classes_per_stripe: null }),
  ];
  const kidRanks = [
    rank(kidsSys, 1, "White", "#f8fafc", { classes_per_stripe: 12, months_per_stripe: 1 }),
    rank(kidsSys, 2, "Grey/White", "#d4d4d8", { min_classes: 50, min_months: 6, classes_per_stripe: 12, months_per_stripe: 1 }),
    rank(kidsSys, 3, "Grey", "#a1a1aa", { min_classes: 50, min_months: 6, classes_per_stripe: 12, months_per_stripe: 1 }),
    rank(kidsSys, 4, "Grey/Black", "#52525b", { min_classes: 50, min_months: 6, classes_per_stripe: 12, months_per_stripe: 1 }),
    rank(kidsSys, 5, "Yellow/White", "#fde047", { min_classes: 60, min_months: 8, classes_per_stripe: 15, months_per_stripe: 2 }),
    rank(kidsSys, 6, "Yellow", "#facc15", { min_classes: 60, min_months: 8, classes_per_stripe: 15, months_per_stripe: 2 }),
  ];
  const mtRanks = ["White", "Yellow", "Orange", "Green", "Blue", "Brown", "Red", "Black"].map((n, i) =>
    rank(mt, i + 1, `${n} Prajioud`, ["#f8fafc", "#facc15", "#fb923c", "#16a34a", "#2563eb", "#78350f", "#dc2626", "#0a0a0a"][i], { max_stripes: 0, min_classes: i === 0 ? 0 : 30 + i * 20, min_months: i === 0 ? 0 : 2 + i * 2, requirements: i === 1 ? "Stance, jab-cross-hook, roundhouse kick, teep, basic guard." : null }));

  const award = (m: Member, s: RankSystem, ranks: Rank[], idx: number, stripes: number, monthsAt: number) => {
    const r = ranks[Math.min(idx, ranks.length - 1)];
    const awardedDays = Math.round(monthsAt * 30.4);
    b.add("member_ranks", { id: b.id(), gym_id: g, member_id: m.id, system_id: s.id, rank_id: r.id, stripes: Math.min(stripes, r.max_stripes), awarded_on: b.date(awardedDays), last_stripe_on: stripes > 0 ? b.date(Math.round(awardedDays / (stripes + 1))) : null });
    if (idx > 0) b.add("promotions", { id: b.id(), gym_id: g, member_id: m.id, system_id: s.id, from_rank_id: ranks[idx - 1].id, to_rank_id: r.id, from_stripes: ranks[idx - 1].max_stripes, to_stripes: 0, awarded_by_coach_id: DEMO_COACH_IDS.rafael, testing_event_id: null, notes: null, promoted_on: b.date(awardedDays) });
  };
  gs.adults.forEach((m, i) => {
    award(m, bjj, bjjRanks, i === 0 ? 0 : i % 6 === 0 ? 2 : i % 3 === 0 ? 1 : 0, i === 0 ? 1 : i % 5, i === 0 ? 4 : 3 + (i % 10));
    if (i % 2 === 0) award(m, mt, mtRanks, i % 4, 0, 2 + (i % 6));
  });
  gs.kids.forEach((k, i) => award(k, kidsSys, kidRanks, i % 4, (i * 3) % 5, 2 + (i % 5)));

  // Curriculum
  const tech = (name: string, rankId: string, category: string, notes: string) => b.add("techniques", { id: b.id(), gym_id: g, discipline_id: gs.disciplines.bjj, rank_id: rankId, name, category, video_url: null, notes, created_at: created });
  tech("Upa (bridge & roll) from mount", bjjRanks[0].id, "Escapes", "Trap the arm and same-side foot before bridging over the shoulder.");
  tech("Elbow-knee escape from mount", bjjRanks[0].id, "Escapes", "Frame on the hip, shrimp, and recover half guard first.");
  tech("Cross collar choke from mount", bjjRanks[0].id, "Submissions", "Deep first grip, thumb inside. Second grip palm-up.");
  tech("Armbar from closed guard", bjjRanks[0].id, "Submissions", "Control the arm across your center line; angle out before swinging the leg.");
  tech("Scissor sweep", bjjRanks[0].id, "Sweeps", "Collar & sleeve grips. Kick out the knee while pulling to the shoulder.");
  tech("Toreando pass", bjjRanks[1].id, "Passing", "Grip pants at the knees, redirect legs, step wide and pin the hip.");
  tech("De La Riva entry & berimbolo", bjjRanks[1].id, "Guard", "Blue-belt curriculum. Drill entries before rolling through.");
  tech("Single-leg X sweep", bjjRanks[1].id, "Sweeps", "Off-balance forward first, then drive the foot to the hip.");
  const mtTech = (name: string, idx: number, notes: string) => b.add("techniques", { id: b.id(), gym_id: g, discipline_id: gs.disciplines.muay_thai, rank_id: mtRanks[idx].id, name, category: "Striking", video_url: null, notes, created_at: created });
  mtTech("Teep (push kick)", 1, "Lift the knee first, push through the ball of the foot.");
  mtTech("Roundhouse kick", 1, "Pivot on the ball of the base foot, turn the hip over.");
  mtTech("Long guard & clinch entry", 2, "Frame to the face/shoulder, close distance behind a long guard.");

  // Kids belt testing in 12 days.
  const testing = b.add("testing_events", { id: b.id(), gym_id: g, system_id: kidsSys.id, name: "Kids Belt Testing: Winter", starts_at: b.iso(-12, 15), location_id: DEMO_LOCATION_ID, fee_cents: 4000, capacity: 20, status: "open", created_at: b.iso(10) });
  gs.kids.slice(0, 7).forEach((k, i) => {
    b.add("testing_registrations", { id: b.id(), gym_id: g, event_id: testing.id, member_id: k.id, target_rank_id: kidRanks[(i % 4) + 1].id, transaction_id: null, paid: i < 5, result: null, certificate_path: null, created_at: b.iso(8 - i) });
  });
  const past = b.add("testing_events", { id: b.id(), gym_id: g, system_id: kidsSys.id, name: "Kids Belt Testing: Summer", starts_at: b.iso(140, 15), location_id: DEMO_LOCATION_ID, fee_cents: 4000, capacity: 20, status: "completed", created_at: b.iso(170) });
  gs.kids.slice(2, 8).forEach((k, i) => b.add("testing_registrations", { id: b.id(), gym_id: g, event_id: past.id, member_id: k.id, target_rank_id: kidRanks[(i % 3) + 1].id, transaction_id: null, paid: true, result: i === 4 ? "incomplete" : "pass", certificate_path: null, created_at: b.iso(150) }));

  seedFightTeam(b, gs);
}

function seedFightTeam(b: SeedBuilder, gs: GymSeed): void {
  const event = b.add("fight_events", { id: b.id(), gym_id: g, name: "Garden State Fight Night 42", promotion: "GSFN", event_date: b.date(-24), venue: "Ironbound Hall", city: "Newark, NJ", weigh_in_at: b.iso(-23, 22), created_at: b.iso(30) });
  b.add("fight_events", { id: b.id(), gym_id: g, name: "NAGA Newark (grappling)", promotion: "NAGA", event_date: b.date(-45), venue: "Prudential Center", city: "Newark, NJ", weigh_in_at: null, created_at: b.iso(20) });
  const roster: [number, string, string, number, boolean, ("orthodox" | "southpaw")][] = [
    [2, "The Wall", "Welterweight (170)", 182, false, "orthodox"], [6, "Sweet Science", "Lightweight (155)", 166, true, "orthodox"],
    [10, "Mack", "Middleweight (185)", 197, false, "southpaw"], [13, "Ice", "Bantamweight (135)", 143, false, "orthodox"],
    [19, "Dynamite", "Flyweight (125)", 131, false, "southpaw"],
  ];
  const opponents = ["J. Rivera", "K. Thompson", "M. Okoye", "D. Fischer", "L. Santos", "A. Petrov", "R. Gomez", "T. Nguyen", "S. Murphy", "B. Ivanov"];
  const methods = ["ko", "tko", "submission", "decision_unanimous", "decision_split"] as const;
  roster.forEach(([idx, nick, wc, walk, isPro, stance], fi) => {
    const m = gs.adults[idx];
    const f = b.add("fighters", { id: b.id(), gym_id: g, member_id: m.id, nickname: nick, disciplines: fi % 2 ? ["MMA", "Muay Thai"] : ["MMA"], weight_class: wc, walk_weight_lb: walk, height_in: 66 + fi * 2, reach_in: 68 + fi * 2, stance, is_pro: isPro, active: true, created_at: b.iso(300) });
    const bouts = 3 + fi;
    for (let k = 0; k < bouts; k++) {
      const result = b.rng.pick(["win", "win", "win", "loss", "draw"] as const);
      b.add("fights", { id: b.id(), gym_id: g, fighter_id: f.id, event_id: null, event_name: `Regional Card ${k + 1}`, fight_date: b.date(60 + k * 75), opponent: b.rng.pick(opponents), discipline: "mma", level: isPro && k < 2 ? "pro" : "amateur", weight_class: wc, result, method: result === "draw" ? "decision_majority" : b.rng.pick(methods), round: b.rng.int(1, 3), time: `${b.rng.int(0, 4)}:${String(b.rng.int(0, 59)).padStart(2, "0")}`, notes: null });
    }
    if (fi < 3) {
      const upcoming = b.add("fights", { id: b.id(), gym_id: g, fighter_id: f.id, event_id: event.id, event_name: event.name, fight_date: event.event_date, opponent: b.rng.pick(opponents), discipline: "mma", level: isPro ? "pro" : "amateur", weight_class: wc, result: null, method: null, round: null, time: null, notes: "Scheduled 3x5 (pro) / 3x3 (am)" });
      const target = Number(wc.match(/\((\d+)\)/)?.[1] ?? walk - 10);
      b.add("fight_camps", { id: b.id(), gym_id: g, fighter_id: f.id, fight_id: upcoming.id, starts_on: b.date(32), ends_on: event.event_date, target_weight_lb: target, created_at: b.iso(32), plan: [
        { week: 1, focus: "Base conditioning, technical sparring", sessions: ["AM: roadwork 5k", "PM: MMA class", "Strength x2"] },
        { week: 3, focus: "Opponent-specific: southpaw looks, cage wrestling", sessions: ["Hard sparring Tue/Thu", "Wrestling Wed", "Pads Mon/Fri"] },
        { week: 6, focus: "Peak: 5-round sparring", sessions: ["Hard sparring Tue", "Flow rounds Thu", "Recovery"] },
        { week: 8, focus: "Taper + weight cut", sessions: ["Light pads", "Sauna protocol w/ coach", "Weigh-in Fri"] },
      ] });
      for (let w = 0; w < 6; w++) b.add("weigh_ins", { id: b.id(), gym_id: g, fighter_id: f.id, weighed_on: b.date(30 - w * 5), weight_lb: Math.round((walk - w * ((walk - target - 4) / 6)) * 10) / 10, target_lb: target, is_official: false, notes: null });
    }
    b.add("fighter_documents", { id: b.id(), gym_id: g, fighter_id: f.id, kind: "medical", title: "Annual physical", file_path: null, issued_on: b.date(330 - fi * 40), expires_on: b.date(-(35 + fi * 40) + (fi === 1 ? 60 : 0)), created_at: b.iso(330) });
    b.add("fighter_documents", { id: b.id(), gym_id: g, fighter_id: f.id, kind: "license", title: isPro ? "NJ State Athletic Control Board: Pro license" : "Amateur ID card", file_path: null, issued_on: b.date(200), expires_on: b.date(fi === 0 ? -12 : -165), created_at: b.iso(200) });
    if (fi < 3) b.add("fighter_documents", { id: b.id(), gym_id: g, fighter_id: f.id, kind: "bloodwork", title: "HIV / Hep B / Hep C panel", file_path: null, issued_on: b.date(40), expires_on: b.date(-(140 - fi * 60)), created_at: b.iso(40) });
  });
}
