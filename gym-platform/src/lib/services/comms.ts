import { z } from "zod";
import type { Lead, LeadStage, MessageThread } from "@/lib/data/types";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/messaging/sms";
import { computeRetentionAlerts } from "@/lib/domain/retention";
import { formatCents } from "@/lib/domain/money";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";
import { fillTemplate, notifyMember } from "./notify";
import { rankViews } from "./ranks";
import { emitWebhook } from "./webhooks";

const phone = z.string().trim().transform((v) => {
  const digits = v.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+1${digits.replace(/^1/, "")}`;
}).pipe(z.string().regex(/^\+[1-9]\d{9,14}$/, "Enter a valid phone number"));

export const leadSchema = z.object({
  firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")), phone: phone.optional().or(z.literal("")),
  interest: z.string().trim().max(200).optional(), source: z.string().trim().max(40).default("web_form"),
}).refine((l) => l.email || l.phone, { message: "Email or phone is required" });

/** Public lead form + manual entry. Starts the "lead_created" automation. */
export async function createLead(ctx: Ctx, input: z.input<typeof leadSchema>): Promise<Lead> {
  const a = leadSchema.parse(input);
  const lead = await ctx.store.insert("leads", { gym_id: ctx.gym.id, first_name: a.firstName, last_name: a.lastName ?? null, email: a.email || null, phone: a.phone || null, interest: a.interest ?? null, source: a.source, stage: "new", created_at: ctx.now().toISOString(), stage_changed_at: ctx.now().toISOString() });
  await startAutomations(ctx, "lead_created", { leadId: lead.id });
  await emitWebhook(ctx, "lead.created", { lead_id: lead.id });
  return lead;
}

export async function moveLead(ctx: Ctx, input: { leadId: string; stage: LeadStage; lostReason?: string }): Promise<Lead> {
  const stage = z.enum(["new", "contacted", "trial_booked", "trial_done", "joined", "lost"]).parse(input.stage);
  const lead = await mustGet(ctx, "leads", input.leadId);
  let memberId = lead.member_id;
  if (stage === "joined" && !memberId) {
    const m = await ctx.store.insert("members", { gym_id: ctx.gym.id, first_name: lead.first_name, last_name: lead.last_name ?? "", email: lead.email, phone: lead.phone, status: "active", notes: lead.interest ? `Interest: ${lead.interest}` : null, created_at: ctx.now().toISOString() });
    memberId = m.id;
  }
  const updated = await ctx.store.update("leads", lead.id, { stage, member_id: memberId, lost_reason: stage === "lost" ? input.lostReason ?? "Not specified" : null, stage_changed_at: ctx.now().toISOString() });
  if (stage === "trial_booked") await startAutomations(ctx, "trial_booked", { leadId: lead.id });
  if (stage === "trial_done") await startAutomations(ctx, "trial_attended", { leadId: lead.id });
  if (["joined", "lost"].includes(stage)) {
    for (const run of await ctx.store.list("automation_runs", { where: { lead_id: lead.id, status: "running" } })) await ctx.store.update("automation_runs", run.id, { status: "stopped" });
  }
  return updated;
}

export async function startAutomations(ctx: Ctx, trigger: string, who: { leadId?: string; memberId?: string }): Promise<void> {
  const autos = await ctx.store.list("automations", { where: { gym_id: ctx.gym.id, trigger, is_active: true } });
  for (const a of autos) {
    const run = await ctx.store.insert("automation_runs", { gym_id: ctx.gym.id, automation_id: a.id, lead_id: who.leadId ?? null, member_id: who.memberId ?? null, step_index: 0, next_run_at: new Date(ctx.now().getTime() + (a.steps[0]?.delay_hours ?? 0) * 3_600_000).toISOString(), status: "running", created_at: ctx.now().toISOString() });
    if ((a.steps[0]?.delay_hours ?? 0) === 0) await runAutomationStep(ctx, run.id);
  }
}

/** Executes one due step; called inline and by /api/cron/automations. */
export async function runAutomationStep(ctx: Ctx, runId: string): Promise<void> {
  const run = await mustGet(ctx, "automation_runs", runId);
  const auto = await mustGet(ctx, "automations", run.automation_id);
  const step = auto.steps[run.step_index];
  if (!step || run.status !== "running") return;
  const target = run.lead_id ? await ctx.store.get("leads", run.lead_id) : null;
  const member = run.member_id ? await ctx.store.get("members", run.member_id) : null;
  const link = `${env.appUrl}/g/${ctx.gym.slug}`;
  const body = fillTemplate(step.template, { first_name: target?.first_name ?? member?.first_name ?? "there", link: step.template.includes("review") ? ctx.gym.google_review_url ?? link : link }, ctx.gym.name);
  if (member) await notifyMember(ctx, member, { category: "automation", sms: step.channel === "sms" ? body : undefined, email: step.channel === "email" ? body : undefined, subject: auto.name, refId: run.id });
  else if (target && step.channel === "sms" && target.phone) await sendThreadMessage(ctx, { threadId: (await threadFor(ctx, { leadId: target.id })).id, body, automationId: auto.id });
  else if (target?.email) await ctx.store.insert("notifications_outbox", { gym_id: ctx.gym.id, channel: "email", to_address: target.email, subject: auto.name, body, category: "automation", ref_id: run.id, send_after: ctx.now().toISOString(), sent_at: ctx.now().toISOString(), status: "sent", error: null, created_at: ctx.now().toISOString() });
  const nextIdx = run.step_index + 1;
  const next = auto.steps[nextIdx];
  await ctx.store.update("automation_runs", run.id, next ? { step_index: nextIdx, next_run_at: new Date(new Date(run.created_at).getTime() + next.delay_hours * 3_600_000).toISOString() } : { status: "completed", next_run_at: null });
}

export async function runDueAutomations(ctx: Ctx): Promise<number> {
  const due = (await ctx.store.list("automation_runs", { where: { gym_id: ctx.gym.id, status: "running" } })).filter((r) => r.next_run_at && r.next_run_at <= ctx.now().toISOString());
  for (const r of due) await runAutomationStep(ctx, r.id);
  return due.length;
}

// --- Two-way SMS inbox -------------------------------------------------------
export async function threadFor(ctx: Ctx, who: { memberId?: string; leadId?: string; coachId?: string | null }): Promise<MessageThread> {
  const where = who.memberId ? { member_id: who.memberId } : { lead_id: who.leadId };
  const existing = (await ctx.store.list("message_threads", { where: { gym_id: ctx.gym.id, ...where } })).find((t) => (t.coach_id ?? null) === (who.coachId ?? null));
  if (existing) return existing;
  const p = who.memberId ? await mustGet(ctx, "members", who.memberId) : await mustGet(ctx, "leads", who.leadId!);
  return ctx.store.insert("message_threads", { gym_id: ctx.gym.id, coach_id: who.coachId ?? null, member_id: who.memberId ?? null, lead_id: who.leadId ?? null, contact_name: `${p.first_name} ${p.last_name ?? ""}`.trim(), contact_phone: p.phone, contact_email: p.email, last_message_at: ctx.now().toISOString(), unread_count: 0, is_archived: false });
}

export const sendMessageSchema = z.object({ threadId: z.string().uuid(), body: z.string().trim().min(1).max(1600), automationId: z.string().uuid().optional() });

export async function sendThreadMessage(ctx: Ctx, input: z.input<typeof sendMessageSchema>) {
  const a = sendMessageSchema.parse(input);
  const t = await mustGet(ctx, "message_threads", a.threadId);
  if (!t.contact_phone) throw new AppError("This contact has no phone number.");
  const r = await sendSms(t.contact_phone, a.body);
  const msg = await ctx.store.insert("messages", { gym_id: ctx.gym.id, thread_id: t.id, direction: "outbound", channel: "sms", body: a.body, status: r.status === "failed" ? "failed" : "sent", provider_id: r.providerId || null, sent_by_user: ctx.actor.userId, automation_id: a.automationId ?? null, created_at: ctx.now().toISOString() });
  await ctx.store.update("message_threads", t.id, { last_message_at: msg.created_at, unread_count: 0 });
  if (r.status === "failed") throw new AppError(r.error ?? "SMS failed to send");
  return msg;
}

/** Inbound SMS webhook: route to the right thread (coach inbox if last outbound came from one). */
export async function receiveSms(ctx: Ctx, from: string, body: string) {
  const threads = (await ctx.store.list("message_threads", { where: { gym_id: ctx.gym.id, contact_phone: from } })).sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
  let thread = threads[0];
  if (!thread) {
    const member = await ctx.store.first("members", { where: { gym_id: ctx.gym.id, phone: from } });
    thread = member ? await threadFor(ctx, { memberId: member.id }) : await threadFor(ctx, { leadId: (await createLead(ctx, { firstName: "Unknown", phone: from, source: "sms" })).id });
  }
  if (/^\s*stop\s*$/i.test(body) && thread.member_id) await ctx.store.update("members", thread.member_id, { sms_opt_in: false });
  await ctx.store.insert("messages", { gym_id: ctx.gym.id, thread_id: thread.id, direction: "inbound", channel: "sms", body: body.slice(0, 1600), status: "received", created_at: ctx.now().toISOString() });
  await ctx.store.update("message_threads", thread.id, { last_message_at: ctx.now().toISOString(), unread_count: thread.unread_count + 1 });
  return thread;
}

/** Retention alerts for the dashboard + automations. */
export async function retentionAlerts(ctx: Ctx) {
  const [members, ents, products, memberships, failed] = await Promise.all([
    ctx.store.list("members", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("entitlements", { where: { gym_id: ctx.gym.id, status: "active" } }),
    ctx.store.list("products", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("memberships", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("transactions", { where: { gym_id: ctx.gym.id, status: "failed" } }),
  ]);
  const views = await rankViews(ctx);
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? "Package";
  const eligible = [...views.entries()].flatMap(([memberId, vs]) => vs.filter((v) => v.eligibility.eligible).map((v) => ({ memberId, label: `${v.systemName}: ${v.eligibility.kind === "stripe" ? `stripe ${v.memberRank.stripes + 1} on ${v.rank.name}` : `promotion to ${v.eligibility.nextRankName}`}` })));
  return computeRetentionAlerts({
    now: ctx.now(), settings: ctx.gym.settings.retention,
    members: members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, status: m.status, lastAttendedAt: m.last_attended_at ? new Date(m.last_attended_at) : null })),
    packages: ents.map((e) => ({ memberId: e.member_id, name: pname(e.product_id), creditsTotal: e.credits_total, creditsUsed: e.credits_used, status: e.status, expiresAt: e.expires_at ? new Date(e.expires_at) : null })),
    memberships: memberships.map((m) => ({ memberId: m.member_id, name: pname(m.product_id), status: m.status, currentPeriodEnd: new Date(m.current_period_end), cancelAtPeriodEnd: m.cancel_at_period_end })),
    eligible,
    failedPayments: failed.filter((f) => f.member_id).map((f) => ({ memberId: f.member_id!, amount: formatCents(f.total_cents) })),
  });
}

/** Review request after a completed private/class. */
export async function requestReview(ctx: Ctx, memberId: string) {
  if (!ctx.gym.google_review_url) throw new AppError("Add your Google review link in Settings → Branding first.");
  const m = await mustGet(ctx, "members", memberId);
  await notifyMember(ctx, m, { category: "review_request", sms: `Thanks for training with ${ctx.gym.name}, ${m.first_name}! If you have a minute, a Google review helps a lot: ${ctx.gym.google_review_url}` });
  await audit(ctx, "review.requested", "members", m.id);
}
