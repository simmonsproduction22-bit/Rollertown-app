import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Field, Flash, PageHeader, Tabs, cx } from "@/components/ui";
import { ago, dateFmt } from "@/lib/format";
import { automationToggleAction, leadAction, runAutomationsAction, sendMessageAction } from "@/app/actions/staff";
import type { LeadStage } from "@/lib/data/types";

export const metadata = { title: "Messages & leads" };
const STAGES: LeadStage[] = ["new", "contacted", "trial_booked", "trial_done", "joined", "lost"];

export default async function MessagesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "inbox";
  const { s, ctx } = await pageCtx("messages.view");
  const tz = ctx.gym.timezone;
  // Independent coaches see only their own inbox; staff see the gym inbox + coach inboxes.
  const allThreads = await ctx.store.list("message_threads", { where: { gym_id: ctx.gym.id }, order: { column: "last_message_at", ascending: false } });
  const threads = s.role === "independent_coach" ? allThreads.filter((t) => t.coach_id === s.coachId) : allThreads;
  const active = threads.find((t) => t.id === one(sp.thread)) ?? threads[0];
  const msgs = active ? await ctx.store.list("messages", { where: { thread_id: active.id }, order: { column: "created_at" } }) : [];
  const coaches = await ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } });
  const tabs = [{ key: "inbox", label: "SMS inbox", href: "/app/messages" }, ...(s.role === "independent_coach" ? [] : [{ key: "leads", label: "Lead pipeline", href: "/app/messages?tab=leads" }, { key: "automations", label: "Automations", href: "/app/messages?tab=automations" }])];

  return (
    <>
      <PageHeader title="Messages & leads" subtitle="Two-way SMS, lead pipeline and automated follow-ups. All included." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs tabs={tabs} active={tab} />
      {tab === "inbox" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <ul className="divide-y divide-line">
              {threads.map((t) => (
                <li key={t.id}><Link href={`/app/messages?thread=${t.id}`} className={cx("block py-3", active?.id === t.id && "text-brand")}>
                  <div className="flex justify-between"><span className="font-medium">{t.contact_name}</span>{t.unread_count > 0 && <Badge tone="brand">{t.unread_count}</Badge>}</div>
                  <div className="text-xs text-muted">{t.coach_id ? `${coaches.find((c) => c.id === t.coach_id)?.display_name}'s inbox` : "Gym inbox"} · {ago(t.last_message_at)}{t.lead_id ? " · lead" : ""}</div>
                </Link></li>
              ))}
            </ul>
          </Card>
          <Card className="lg:col-span-2" title={active ? `${active.contact_name} · ${active.contact_phone ?? ""}` : "No conversations"}>
            <ol className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto" aria-live="polite">
              {msgs.map((m) => <li key={m.id} className={cx("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.direction === "outbound" ? "self-end bg-brand text-brand-fg" : "self-start bg-raised")}>{m.body}<div className="mt-1 text-[10px] opacity-70">{dateFmt(m.created_at, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{m.automation_id ? " · automated" : ""}</div></li>)}
            </ol>
            {active && <form action={sendMessageAction} className="mt-4 flex gap-2"><input type="hidden" name="threadId" value={active.id} /><input type="hidden" name="back" value={`/app/messages?thread=${active.id}`} /><input name="body" required maxLength={1600} className="input" placeholder="Type a text…" aria-label="Message" /><button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-brand-fg">Send</button></form>}
          </Card>
        </div>
      )}
      {tab === "leads" && <Leads gymId={ctx.gym.id} store={ctx.store} tz={tz} />}
      {tab === "automations" && <Automations gymId={ctx.gym.id} store={ctx.store} />}
    </>
  );
}

async function Leads({ gymId, store, tz }: { gymId: string; store: Awaited<ReturnType<typeof pageCtx>>["ctx"]["store"]; tz: string }) {
  const leads = await store.list("leads", { where: { gym_id: gymId }, order: { column: "created_at", ascending: false } });
  return (
    <>
      <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((st) => (
          <section key={st} aria-label={st} className="min-w-52 rounded-xl border border-line bg-surface p-3">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted">{st.replace("_", " ")} · {leads.filter((l) => l.stage === st).length}</h2>
            <ul className="space-y-2">{leads.filter((l) => l.stage === st).map((l) => (
              <li key={l.id} className="rounded-lg bg-raised p-2 text-sm">
                <div className="font-medium">{l.first_name} {l.last_name}</div><div className="text-xs text-muted">{l.interest} · {l.source} · {dateFmt(l.created_at, tz)}</div>
                <form action={leadAction} className="mt-2 flex gap-1"><input type="hidden" name="leadId" value={l.id} /><select name="stage" defaultValue={l.stage} className="input min-h-8 py-0 text-xs" aria-label="Move to stage">{STAGES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select><button className="rounded border border-line px-2 text-xs">Move</button></form>
              </li>
            ))}</ul>
          </section>
        ))}
      </div>
      <Card className="mt-6" title="Add a lead">
        <form action={leadAction} className="grid gap-3 sm:grid-cols-5"><Field label="First name" name="firstName" required /><Field label="Last name" name="lastName" /><Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" type="tel" /><Field label="Interest" name="interest" /><div><button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">Add & start follow-up</button></div></form>
        <p className="mt-3 text-xs text-muted">Embed the lead form on your site: your public page at <code>/g/{"{slug}"}</code> has one built in.</p>
      </Card>
    </>
  );
}

async function Automations({ gymId, store }: { gymId: string; store: Awaited<ReturnType<typeof pageCtx>>["ctx"]["store"] }) {
  const [autos, runs] = await Promise.all([store.list("automations", { where: { gym_id: gymId } }), store.list("automation_runs", { where: { gym_id: gymId } })]);
  return (
    <>
      <div className="mb-4 flex justify-end"><form action={runAutomationsAction}><button className="min-h-11 rounded-lg border border-line px-4 text-sm">Run due steps now</button></form></div>
      <div className="grid gap-4 md:grid-cols-2">
        {autos.map((a) => (
          <Card key={a.id} title={<>{a.name} <Badge tone={a.is_active ? "ok" : "neutral"}>{a.is_active ? "on" : "paused"}</Badge></>} action={<form action={automationToggleAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={String(!a.is_active)} /><button className="text-sm underline">{a.is_active ? "Pause" : "Enable"}</button></form>}>
            <p className="text-xs text-muted">Trigger: {a.trigger.replace(/_/g, " ")} · {runs.filter((r) => r.automation_id === a.id && r.status === "running").length} running</p>
            <ol className="mt-3 space-y-2 text-sm">{a.steps.map((st, i) => <li key={i} className="rounded-lg bg-raised p-2"><span className="text-xs font-semibold uppercase text-muted">{st.delay_hours ? `+${st.delay_hours}h` : "immediately"} · {st.channel}</span><p>{st.template}</p></li>)}</ol>
          </Card>
        ))}
      </div>
    </>
  );
}
