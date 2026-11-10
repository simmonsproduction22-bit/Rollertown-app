import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Flash, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { dateFmt, fullName, money } from "@/lib/format";
import { retryPaymentAction } from "@/app/actions/staff";
import { formatBps } from "@/lib/domain/money";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "transactions";
  const { ctx } = await pageCtx("payments.view");
  const tz = ctx.gym.timezone;
  const [txns, splits, refunds, payouts, members, coaches, dunning, audit] = await Promise.all([
    ctx.store.list("transactions", { where: { gym_id: ctx.gym.id }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("splits", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("refunds", { where: { gym_id: ctx.gym.id }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("payouts", { where: { gym_id: ctx.gym.id }, order: { column: "arrival_date", ascending: false } }),
    ctx.store.list("members", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("dunning_attempts", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("audit_log", { where: { gym_id: ctx.gym.id }, order: { column: "created_at", ascending: false }, limit: 40 }),
  ]);
  const member = (id: string | null) => members.find((m) => m.id === id);
  const last30 = txns.filter((t) => t.status !== "failed" && Date.now() - new Date(t.created_at).getTime() < 30 * 86_400_000);
  const failed = txns.filter((t) => t.status === "failed");
  const tabs = ["transactions", "failed", "refunds", "payouts", "audit"].map((k) => ({ key: k, label: k === "failed" ? `Failed (${failed.length})` : k[0].toUpperCase() + k.slice(1), href: `/app/payments?tab=${k}` }));
  const here = `/app/payments?tab=${tab}`;

  return (
    <>
      <PageHeader title="Payments & payouts" subtitle={`Platform fee: ${formatBps(ctx.gym.platform_fee_bps)} per card transaction, shown on every receipt. No other fees.`} />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected (30d)" value={money(last30.reduce((a, t) => a + t.total_cents, 0))} />
        <Stat label="Refunded (30d)" value={money(last30.reduce((a, t) => a + t.refunded_cents, 0))} />
        <Stat label="Platform fees (30d)" value={money(last30.reduce((a, t) => a + t.platform_fee_cents, 0))} hint="the only fee we charge" />
        <Stat label="Failed, retrying" value={failed.length} tone={failed.length ? "bad" : "ok"} />
      </div>
      <Tabs tabs={tabs} active={tab} />
      <Card>
        {tab === "transactions" && (
          <Table head={["Date", "Member", "Description", "Total", "Gym / Coach / Fee", "Status"]}>
            {txns.slice(0, 60).map((t) => {
              const sp2 = splits.filter((x) => x.transaction_id === t.id);
              const part = (p: string) => sp2.filter((x) => x.party === p).reduce((a, x) => a + x.amount_cents - x.reversed_cents, 0);
              return (
                <tr key={t.id}>
                  <td className="td whitespace-nowrap text-muted">{dateFmt(t.created_at, tz)}</td>
                  <td className="td">{t.member_id ? <Link href={`/app/members/${t.member_id}`} className="hover:underline">{fullName(member(t.member_id))}</Link> : t.payer_email ?? "Walk-in"}</td>
                  <td className="td">{t.description}{t.coach_id && <div className="text-xs text-muted">Coach: {coaches.find((c) => c.id === t.coach_id)?.display_name}</div>}</td>
                  <td className="td tabular-nums">{money(t.total_cents)}{t.refunded_cents ? <div className="text-xs text-bad">−{money(t.refunded_cents)}</div> : null}</td>
                  <td className="td text-xs tabular-nums text-muted">{money(part("gym"))} / {money(part("coach"))} / {money(part("platform"))}</td>
                  <td className="td"><Badge tone={t.status === "succeeded" ? "ok" : t.status === "failed" ? "bad" : "warn"}>{t.status.replace("_", " ")}</Badge></td>
                </tr>
              );
            })}
          </Table>
        )}
        {tab === "failed" && (
          <Table head={["Member", "Amount", "Reason", "Attempts", "Next retry", ""]} empty={failed.length ? undefined : "No failed payments."}>
            {failed.map((t) => (
              <tr key={t.id}>
                <td className="td"><Link href={`/app/members/${t.member_id}`} className="hover:underline">{fullName(member(t.member_id))}</Link></td>
                <td className="td">{money(t.total_cents)}</td><td className="td text-sm text-bad">{t.failure_reason}</td>
                <td className="td text-sm">{t.attempt_count} · {dunning.filter((x) => x.transaction_id === t.id && x.channel !== "retry").length} reminders</td>
                <td className="td text-sm">{t.next_retry_at ? dateFmt(t.next_retry_at, tz) : "final"}</td>
                <td className="td"><form action={retryPaymentAction}><input type="hidden" name="transactionId" value={t.id} /><input type="hidden" name="back" value={here} /><button className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg">Retry now</button></form></td>
              </tr>
            ))}
          </Table>
        )}
        {tab === "refunds" && (
          <Table head={["Date", "Payment", "Amount", "Reason", "Credits", "Policy"]} empty={refunds.length ? undefined : "No refunds yet."}>
            {refunds.map((r) => { const t = txns.find((x) => x.id === r.transaction_id); return <tr key={r.id}><td className="td">{dateFmt(r.created_at, tz)}</td><td className="td">{t?.description} · {fullName(member(t?.member_id ?? null))}</td><td className="td">{money(r.amount_cents)}</td><td className="td">{r.reason}</td><td className="td">{r.credits_changed ? `${r.credits_action} ${r.credits_changed}` : "-"}</td><td className="td text-xs">{r.policy_applied}{r.was_override && <Badge tone="warn">override</Badge>}</td></tr>; })}
          </Table>
        )}
        {tab === "payouts" && (
          <Table head={["Arrival", "To", "Amount", "Status"]}>
            {payouts.slice(0, 40).map((p) => <tr key={p.id}><td className="td">{p.arrival_date}</td><td className="td">{p.party === "gym" ? ctx.gym.name : coaches.find((c) => c.id === p.coach_id)?.display_name}</td><td className="td tabular-nums">{money(p.amount_cents)}</td><td className="td"><Badge tone={p.status === "paid" ? "ok" : "neutral"}>{p.status.replace("_", " ")}</Badge></td></tr>)}
          </Table>
        )}
        {tab === "audit" && (
          <Table head={["When", "Who", "Action", "Details"]}>
            {audit.map((a, i) => <tr key={a.id ?? i}><td className="td whitespace-nowrap">{dateFmt(a.created_at, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td><td className="td">{a.actor_label}</td><td className="td"><Badge>{a.action}</Badge></td><td className="td font-mono text-xs text-muted">{JSON.stringify(a.details).slice(0, 140)}</td></tr>)}
          </Table>
        )}
      </Card>
    </>
  );
}
