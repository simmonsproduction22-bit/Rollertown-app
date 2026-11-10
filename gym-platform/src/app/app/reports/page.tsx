import Link from "next/link";
import { pageCtx } from "@/lib/ctx";
import { buildReports } from "@/lib/services/reports";
import { Card, PageHeader, Stat, Table } from "@/components/ui";
import { Bars, monthLabel } from "@/components/charts";
import { fullName, money } from "@/lib/format";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { ctx } = await pageCtx("reports.view");
  const r = await buildReports(ctx);
  const types = await ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } });
  const k = (v: number) => `$${(v / 100000).toFixed(1)}k`;
  return (
    <>
      <PageHeader title="Reports" subtitle="Everything is computed from your raw data, and the same numbers are in your export." actions={<Link href="/api/export" className="rounded-lg border border-line px-3 py-2 text-sm">Download all data</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR" value={money(r.mrr)} /><Stat label="Active memberships" value={r.activeMemberships} />
        <Stat label="30-day attendance rate" value={`${Math.round(r.retention30 * 100)}%`} /><Stat label="Platform fees (all time)" value={money(r.feesTotal)} hint={`Refunded all time: ${money(r.refundsTotal)}`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Revenue by month (gross, with net-to-gym in green)"><Bars label="Revenue" data={r.revenue.map((m) => ({ label: monthLabel(m.month), value: m.gross, secondary: m.gym }))} format={k} /></Card>
        <Card title="Attendance (check-ins)"><Bars label="Check-ins" data={r.attendance.map((m) => ({ label: monthLabel(m.month), value: m.checkins }))} format={(v) => String(v)} /></Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Membership growth & churn">
          <Table head={["Month", "Joined", "Cancelled", "Active", "Churn"]}>{r.growth.map((g) => <tr key={g.month}><td className="td">{monthLabel(g.month)}</td><td className="td">{g.joined}</td><td className="td">{g.cancelled}</td><td className="td">{g.active}</td><td className="td">{(g.churnRate * 100).toFixed(1)}%</td></tr>)}</Table>
        </Card>
        <Card title="Revenue split by party">
          <Table head={["Month", "Gym", "Coaches", "Fee", "Refunds"]}>{r.revenue.map((m) => <tr key={m.month}><td className="td">{monthLabel(m.month)}</td><td className="td tabular-nums">{money(m.gym)}</td><td className="td tabular-nums">{money(m.coach)}</td><td className="td tabular-nums">{money(m.fee)}</td><td className="td tabular-nums">{money(m.refunded)}</td></tr>)}</Table>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Package liability: ${money(r.liability.unearnedCents)} prepaid, not yet earned`}>
          <Table head={["Member", "Used", "Paid", "Earned", "Unearned"]}>{r.liabilityRows.slice(0, 15).map((x) => <tr key={x.entitlement.id}><td className="td">{fullName(x.member)}</td><td className="td">{x.entitlement.credits_used}/{x.entitlement.credits_total}</td><td className="td tabular-nums">{money(x.entitlement.amount_paid_cents)}</td><td className="td tabular-nums">{money(x.earned)}</td><td className="td tabular-nums font-semibold">{money(x.unearned)}</td></tr>)}</Table>
        </Card>
        <Card title="Coach payouts">
          <Table head={["Coach", "Earned", "Gym share", "Rent collected", "Rent due"]}>{r.coachPayouts.map((c) => <tr key={c.coach.id}><td className="td">{c.coach.display_name}</td><td className="td tabular-nums">{money(c.earned)}</td><td className="td tabular-nums">{money(c.gymShare)}</td><td className="td tabular-nums">{money(c.rentCollected)}</td><td className="td tabular-nums">{money(c.rentDue)}</td></tr>)}</Table>
        </Card>
      </div>
      <Card className="mt-6" title="Class fill rate (last 30 days)">
        <Table head={["Class", "Sessions", "Avg attended", "Fill"]}>{r.classFill.map(([id, v]) => <tr key={id}><td className="td">{types.find((t) => t.id === id)?.name}</td><td className="td">{v.sessions}</td><td className="td">{(v.attended / Math.max(1, v.sessions)).toFixed(1)}</td><td className="td">{Math.round((v.attended / Math.max(1, v.capacity)) * 100)}%</td></tr>)}</Table>
      </Card>
    </>
  );
}
