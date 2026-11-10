import Link from "next/link";
import { pageCtx } from "@/lib/ctx";
import { buildReports } from "@/lib/services/reports";
import { retentionAlerts } from "@/lib/services/comms";
import { Badge, Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { Bars, monthLabel } from "@/components/charts";
import { money, timeFmt, fullName } from "@/lib/format";
import { can } from "@/lib/auth/roles";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { s, ctx } = await pageCtx("dashboard.view");
  const tz = ctx.gym.timezone;
  const [r, alerts, sessions, types, coaches, leads, docs] = await Promise.all([
    buildReports(ctx),
    retentionAlerts(ctx),
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id }, order: { column: "starts_at" } }),
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("leads", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("fighter_documents", { where: { gym_id: ctx.gym.id } }),
  ]);
  const now = new Date();
  const today = sessions.filter((x) => new Date(x.starts_at) >= new Date(now.getTime() - 3_600_000) && new Date(x.starts_at).getTime() < now.getTime() + 18 * 3_600_000).slice(0, 8);
  const bookings = today.length ? await ctx.store.list("class_bookings", { where: { session_id: { in: today.map((x) => x.id) } } }) : [];
  const members = await ctx.store.list("members", { where: { gym_id: ctx.gym.id } });
  const thisMonth = r.revenue[r.revenue.length - 1];
  const showMoney = can(s.role, "reports.view");
  const expiring = docs.filter((d) => d.expires_on && d.expires_on <= new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10));

  return (
    <>
      <PageHeader title={`Good ${now.getHours() < 12 ? "morning" : "evening"}, ${s.name.split(" ")[0]}`} subtitle={`${ctx.gym.name} · ${new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full" }).format(now)}`}
        actions={<><LinkButton href="/kiosk" variant="secondary">Open kiosk</LinkButton><LinkButton href="/app/members?new=1">Add member</LinkButton></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showMoney && <Stat label="MRR" value={money(r.mrr)} hint={`${r.activeMemberships} active memberships`} />}
        {showMoney && <Stat label="Net revenue this month" value={money(thisMonth.gym)} hint={`Gross ${money(thisMonth.gross)} · fees ${money(thisMonth.fee)}`} />}
        <Stat label="Attended (30 days)" value={`${Math.round(r.retention30 * 100)}%`} hint="of active members came in" tone={r.retention30 > 0.7 ? "ok" : "warn"} />
        {showMoney && <Stat label="Package liability" value={money(r.liability.unearnedCents)} hint={`${r.liability.count} prepaid packages not yet earned`} />}
        {!showMoney && <Stat label="Members" value={r.totalMembers} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today's classes" action={<Link href="/app/schedule" className="text-sm text-muted underline">Full schedule</Link>}>
          <ul className="divide-y divide-line">
            {today.length === 0 && <li className="py-3 text-sm text-muted">No more classes today.</li>}
            {today.map((x) => {
              const t = types.find((y) => y.id === x.class_type_id);
              const b = bookings.filter((y) => y.session_id === x.id);
              const booked = b.filter((y) => ["booked", "attended"].includes(y.status)).length;
              const wait = b.filter((y) => y.status === "waitlisted").length;
              return (
                <li key={x.id} className="flex items-center gap-3 py-3">
                  <span className="h-10 w-1.5 rounded" style={{ background: t?.color }} />
                  <div className="flex-1"><div className="font-medium">{t?.name}</div><div className="text-sm text-muted">{timeFmt(x.starts_at, tz)} · {coaches.find((c) => c.id === x.coach_id)?.display_name}</div></div>
                  <div className="text-right text-sm"><div className="font-semibold tabular-nums">{booked}/{x.capacity}</div>{wait > 0 && <Badge tone="warn">{wait} waitlist</Badge>}</div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={`Retention alerts (${alerts.length})`}>
          <ul className="max-h-96 space-y-3 overflow-y-auto">
            {alerts.slice(0, 12).map((a, i) => (
              <li key={i} className="text-sm">
                <Link href={`/app/members/${a.memberId}`} className="font-medium hover:underline">{a.title}</Link>
                <div className="flex items-center gap-2 text-muted"><Badge tone={a.severity === "bad" ? "bad" : a.severity === "warn" ? "warn" : "brand"}>{a.kind.replace(/_/g, " ")}</Badge>{a.detail}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {showMoney && <Card title="Revenue (net to gym)"><Bars label="Monthly revenue" data={r.revenue.map((m) => ({ label: monthLabel(m.month), value: m.gym }))} format={(v) => `$${Math.round(v / 100000)}k`} /></Card>}
        <Card title="Leads pipeline" action={<Link href="/app/messages?tab=leads" className="text-sm text-muted underline">Open</Link>}>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {(["new", "contacted", "trial_booked", "trial_done", "joined", "lost"] as const).map((st) => <div key={st} className="rounded-lg bg-raised p-2"><dt className="text-[11px] uppercase text-muted">{st.replace("_", " ")}</dt><dd className="text-xl font-bold">{leads.filter((l) => l.stage === st).length}</dd></div>)}
          </dl>
        </Card>
        <Card title="Needs attention">
          <ul className="space-y-2 text-sm">
            {r.failedPayments.slice(0, 4).map((t) => <li key={t.id}><Badge tone="bad">failed</Badge> {fullName(members.find((m) => m.id === t.member_id))} · {money(t.total_cents)} <Link href={`/app/members/${t.member_id}`} className="underline">view</Link></li>)}
            {expiring.slice(0, 4).map((d) => <li key={d.id}><Badge tone="warn">expiring</Badge> {d.title} · {d.expires_on}</li>)}
            {r.failedPayments.length === 0 && expiring.length === 0 && <li className="text-muted">All clear.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
