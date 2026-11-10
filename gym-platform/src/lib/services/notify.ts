import type { Member } from "@/lib/data/types";
import { env } from "@/lib/env";
import { emailProvider, render } from "@/lib/messaging/email";
import { sendSms } from "@/lib/messaging/sms";
import type { Ctx } from "./context";

type Category = "reminder" | "receipt" | "dunning" | "review_request" | "automation" | "alert" | "waiver" | "other";

/** Sends now (or queues) SMS + email to a member, honoring opt-ins and guardians for minors. */
export async function notifyMember(ctx: Ctx, member: Member, msg: { category: Category; sms?: string; subject?: string; email?: string; refId?: string | null; sendAfter?: Date }): Promise<void> {
  const contacts = await contactFor(ctx, member);
  const when = msg.sendAfter ?? ctx.now();
  const immediate = when <= ctx.now();
  const channels = ctx.gym.settings.reminders.channels;
  const jobs: { channel: "sms" | "email"; to: string; body: string; subject: string | null }[] = [];
  if (msg.sms && contacts.phone && member.sms_opt_in && channels.includes("sms")) jobs.push({ channel: "sms", to: contacts.phone, body: msg.sms, subject: null });
  if ((msg.email ?? msg.sms) && contacts.email && member.email_opt_in && channels.includes("email")) jobs.push({ channel: "email", to: contacts.email, body: msg.email ?? msg.sms!, subject: msg.subject ?? ctx.gym.name });
  for (const j of jobs) {
    let status: "queued" | "sent" | "failed" = "queued";
    let error: string | null = null;
    if (immediate) {
      const r = j.channel === "sms" ? await sendSms(j.to, j.body) : await emailProvider().send({ to: j.to, subject: j.subject ?? ctx.gym.name, text: j.body });
      status = r.status === "failed" ? "failed" : "sent";
      error = r.error ?? null;
    }
    await ctx.store.insert("notifications_outbox", { gym_id: ctx.gym.id, channel: j.channel, to_address: j.to, subject: j.subject, body: j.body, category: msg.category, ref_id: msg.refId ?? null, send_after: when.toISOString(), sent_at: status === "sent" ? ctx.now().toISOString() : null, status, error, created_at: ctx.now().toISOString() });
  }
}

/** Minors are contacted through their primary guardian. */
async function contactFor(ctx: Ctx, member: Member): Promise<{ phone: string | null; email: string | null }> {
  if (member.phone || member.email) return { phone: member.phone, email: member.email };
  const g = await ctx.store.first("guardians", { where: { child_member_id: member.id, is_primary: true } });
  return { phone: g?.phone ?? null, email: g?.email ?? null };
}

export async function queueReminders(ctx: Ctx, member: Member, a: { refId: string; startsAt: Date; label: string; kind: "class" | "private" }): Promise<void> {
  const hours = a.kind === "class" ? ctx.gym.settings.reminders.class_hours_before : ctx.gym.settings.reminders.private_hours_before;
  const when = new Intl.DateTimeFormat("en-US", { timeZone: ctx.gym.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(a.startsAt);
  for (const h of hours) {
    const sendAfter = new Date(a.startsAt.getTime() - h * 3_600_000);
    if (sendAfter <= ctx.now()) continue;
    await notifyMember(ctx, member, {
      category: "reminder", refId: a.refId, sendAfter, subject: `Reminder: ${a.label}`,
      sms: `Reminder: ${a.label} ${when} at ${ctx.gym.name}. Need to cancel? Free up to ${ctx.gym.settings.cancellation.window_hours}h before: ${env.appUrl}/m`,
    });
  }
}

export function fillTemplate(template: string, vars: { first_name: string; link: string }, gymName: string): string {
  return render(template, { ...vars, gym_name: gymName });
}
