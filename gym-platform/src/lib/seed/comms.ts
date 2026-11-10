import { createHash } from "node:crypto";
import type { SeedBuilder } from "./builder";
import { DEMO_COACH_IDS, DEMO_GYM_ID, DEMO_MEMBER_ID, DEMO_USERS } from "./constants";
import type { GymSeed } from "./gym";
import type { ScheduleSeed } from "./schedule";

const g = DEMO_GYM_ID;

export function seedComms(b: SeedBuilder, gs: GymSeed, sch: ScheduleSeed): void {
  const future = sch.sessions.filter((s) => new Date(s.starts_at) > b.now && s.class_type_id === sch.classTypes.fund.id);
  const leads: [string, string, string, "new" | "contacted" | "trial_booked" | "trial_done" | "joined" | "lost", string, number][] = [
    ["Jamie", "Ellis", "BJJ for self-defense", "new", "web_form", 0], ["Chris", "Vega", "Muay Thai fitness", "new", "instagram", 1],
    ["Taylor", "Quinn", "Kids program (age 7)", "contacted", "web_form", 2], ["Morgan", "Reed", "MMA, wants to compete", "contacted", "walk_in", 3],
    ["Riley", "Park", "BJJ beginner", "trial_booked", "google", 2], ["Avery", "Stone", "Boxing privates", "trial_booked", "referral", 1],
    ["Jordan", "Blake", "Muay Thai", "trial_done", "web_form", 6], ["Casey", "Nguyen", "Kids BJJ x2", "trial_done", "facebook", 4],
    ["Drew", "Foster", "BJJ", "joined", "web_form", 20], ["Pat", "Lowe", "Fitness", "lost", "instagram", 30],
  ];
  const leadRows = leads.map(([first, last, interest, stage, source, days], i) => b.add("leads", {
    id: b.id(), gym_id: g, first_name: first, last_name: last, email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    phone: `+1555556${String(1000 + i)}`, interest, source, stage, owner_coach_id: i % 3 === 0 ? DEMO_COACH_IDS.rafael : i % 3 === 1 ? DEMO_COACH_IDS.nina : null,
    member_id: null, trial_session_id: stage === "trial_booked" && future[i] ? future[i].id : null, lost_reason: stage === "lost" ? "Price / schedule" : null,
    notes: null, created_at: b.iso(days + 2), stage_changed_at: b.iso(days),
  }));
  b.add("lead_forms", { id: b.id(), gym_id: g, name: "Free trial form", fields: ["first_name", "last_name", "email", "phone", "interest"], thank_you: "Thanks! We'll text you shortly to set up your free trial.", is_active: true, created_at: b.iso(200) });

  const thread = (name: string, phone: string | null, opts: { memberId?: string; leadId?: string; coachId?: string }, msgs: [("inbound" | "outbound"), string, number][]) => {
    const t = b.add("message_threads", { id: b.id(), gym_id: g, coach_id: opts.coachId ?? null, member_id: opts.memberId ?? null, lead_id: opts.leadId ?? null, contact_name: name, contact_phone: phone, contact_email: null, last_message_at: b.iso(msgs[msgs.length - 1][2]), unread_count: msgs[msgs.length - 1][0] === "inbound" ? 1 : 0, is_archived: false });
    msgs.forEach(([direction, body, hoursAgo]) => b.add("messages", { id: b.id(), gym_id: g, thread_id: t.id, direction, channel: "sms", body, status: direction === "inbound" ? "received" : "delivered", provider_id: null, sent_by_user: direction === "outbound" ? DEMO_USERS.front_desk.id : null, automation_id: null, created_at: new Date(b.now.getTime() - hoursAgo * 3_600_000).toISOString() }));
  };
  const A = gs.adults;
  thread(`${leadRows[0].first_name} ${leadRows[0].last_name}`, leadRows[0].phone, { leadId: leadRows[0].id }, [
    ["outbound", "Hi Jamie! Thanks for reaching out to Demo MMA Academy. Want to try a free BJJ Fundamentals class this week?", 20],
    ["inbound", "Yes! Is Thursday 6pm ok? Never trained before.", 3],
  ]);
  thread(`${A[0].first_name} ${A[0].last_name}`, A[0].phone, { memberId: DEMO_MEMBER_ID }, [
    ["inbound", "Can I move my private with Rafael to Friday?", 30], ["outbound", "Done, Friday 3pm. See you then!", 29],
  ]);
  thread(`${A[18].first_name} ${A[18].last_name}`, A[18].phone, { memberId: A[18].id }, [
    ["outbound", `Hey ${A[18].first_name}, we missed you on the mats! Everything ok? Monday Fundamentals is a good one to jump back in.`, 50],
  ]);
  thread(`${A[8].first_name} ${A[8].last_name}`, A[8].phone, { memberId: A[8].id, coachId: DEMO_COACH_IDS.marcus }, [
    ["inbound", "Coach, can we do 2 sessions next week? Got a smoker on the 20th.", 6],
  ]);
  thread(`${A[4].first_name} ${A[4].last_name}`, A[4].phone, { memberId: A[4].id, coachId: DEMO_COACH_IDS.nina }, [
    ["outbound", "Great session today. Work the teep on the heavy bag 3x this week.", 26], ["inbound", "Will do 🙏", 25],
  ]);

  const auto = (name: string, trigger: string, steps: { delay_hours: number; channel: "sms" | "email"; template: string }[], active = true) =>
    b.add("automations", { id: b.id(), gym_id: g, name, trigger, steps, is_active: active, created_at: b.iso(150) });
  const leadSeq = auto("New lead follow-up", "lead_created", [
    { delay_hours: 0, channel: "sms", template: "Hi {{first_name}}! Thanks for your interest in {{gym_name}}. Want to try a free class? Book here: {{link}}" },
    { delay_hours: 48, channel: "email", template: "Still thinking about it, {{first_name}}? Here's our beginner schedule: {{link}}" },
    { delay_hours: 120, channel: "sms", template: "Last nudge from {{gym_name}}: your free trial is waiting. {{link}}" },
  ]);
  auto("Trial reminder", "trial_booked", [
    { delay_hours: 0, channel: "sms", template: "You're booked, {{first_name}}! Wear comfy athletic clothes and arrive 10 min early. {{link}}" },
  ]);
  auto("Post-trial offer", "trial_attended", [
    { delay_hours: 2, channel: "sms", template: "Great job today, {{first_name}}! Join this week and your first month is $99: {{link}}" },
    { delay_hours: 72, channel: "email", template: "{{first_name}}, the $99 first month offer ends Sunday. {{link}}" },
  ]);
  auto("We miss you", "inactive", [
    { delay_hours: 0, channel: "sms", template: "Hey {{first_name}}, we haven't seen you in a bit. Everything ok? Here's this week's schedule: {{link}}" },
  ]);
  auto("Review request", "session_completed", [
    { delay_hours: 3, channel: "sms", template: "Thanks for training with us, {{first_name}}! If you enjoyed it, a quick Google review helps a ton: {{link}}" },
  ]);
  auto("Package almost used", "package_low", [
    { delay_hours: 0, channel: "email", template: "{{first_name}}, you have a couple of sessions left on your package. Renew anytime: {{link}}" },
  ], false);
  leadRows.slice(0, 2).forEach((l) => b.add("automation_runs", { id: b.id(), gym_id: g, automation_id: leadSeq.id, member_id: null, lead_id: l.id, step_index: 1, next_run_at: b.iso(-1), status: "running", created_at: l.created_at }));

  for (const s of future.slice(0, 2)) {
    b.add("notifications_outbox", { id: b.id(), gym_id: g, channel: "sms", to_address: A[0].phone ?? "", subject: null, body: "Reminder: BJJ Fundamentals tomorrow. Reply C to cancel (12h policy).", category: "reminder", ref_id: s.id, send_after: new Date(new Date(s.starts_at).getTime() - 24 * 3_600_000).toISOString(), sent_at: null, status: "queued", error: null, created_at: b.iso(1) });
  }
  b.add("notifications_outbox", { id: b.id(), gym_id: g, channel: "email", to_address: A[7].email ?? "", subject: "Your receipt from Demo MMA Academy", body: "Receipt R-1004 · $189.00", category: "receipt", ref_id: null, send_after: b.iso(3), sent_at: b.iso(3), status: "sent", error: null, created_at: b.iso(3) });

  b.add("import_jobs", { id: b.id(), gym_id: g, source_system: "mindbody", entity: "members", file_name: "mindbody_clients_export.csv", mapping: { first_name: "First Name", last_name: "Last Name", email: "Email" }, status: "completed", row_count: 40, imported_count: 38, error_count: 2, errors: [{ row: 17, messages: ["email: Invalid email"] }, { row: 33, messages: ["last name is required"] }], created_by: DEMO_USERS.owner.id, created_at: b.iso(18) });
  b.add("import_jobs", { id: b.id(), gym_id: g, source_system: "mindbody", entity: "packages", file_name: "mindbody_pricing_options.csv", mapping: {}, status: "completed", row_count: 14, imported_count: 14, error_count: 0, errors: [], created_by: DEMO_USERS.owner.id, created_at: b.iso(18) });

  // A demo API key. Only the hash is stored; the raw key is never kept.
  const rawKey = `gp_live_demo_${b.id().replace(/-/g, "")}`;
  b.add("api_keys", { id: b.id(), gym_id: g, name: "Website integration", key_prefix: rawKey.slice(0, 12), key_hash: createHash("sha256").update(rawKey).digest("hex"), scopes: ["read"], last_used_at: b.iso(1), revoked_at: null, created_at: b.iso(60) });
  const hook = b.add("webhook_endpoints", { id: b.id(), gym_id: g, url: "https://hooks.example.com/demo-mma", events: ["booking.created", "payment.succeeded", "checkin.created"], secret: `whsec_${b.id().replace(/-/g, "")}`, is_active: true, created_at: b.iso(60) });
  b.add("webhook_deliveries", { gym_id: g, endpoint_id: hook.id, event: "checkin.created", payload: { member_id: DEMO_MEMBER_ID }, status_code: 200, attempt: 1, delivered_at: b.iso(1), created_at: b.iso(1) });
  b.add("audit_log", { gym_id: g, actor_user_id: DEMO_USERS.manager.id, actor_label: DEMO_USERS.manager.name, action: "policy.updated", entity: "gyms", entity_id: g, details: { cancellation_window_hours: { from: 6, to: 12 } }, created_at: b.iso(45) });
  b.add("audit_log", { gym_id: g, actor_user_id: DEMO_USERS.front_desk.id, actor_label: DEMO_USERS.front_desk.name, action: "late_cancel.override", entity: "class_bookings", entity_id: null, details: { member: `${A[3].first_name} ${A[3].last_name}`, reason: "Family emergency" }, created_at: b.iso(9) });
}
