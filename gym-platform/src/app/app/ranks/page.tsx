import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { rankViews } from "@/lib/services/ranks";
import { Badge, Bar, Belt, Card, Flash, PageHeader, Table, Tabs } from "@/components/ui";
import { dateFmt, fullName, money } from "@/lib/format";
import { promoteAction, testingResultAction } from "@/app/actions/staff";

export const metadata = { title: "Belts & curriculum" };

export default async function RanksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "eligibility";
  const { ctx } = await pageCtx("ranks.promote");
  const tz = ctx.gym.timezone;
  const [views, members, systems, ranks, techniques, events, regs] = await Promise.all([
    rankViews(ctx), ctx.store.list("members", { where: { gym_id: ctx.gym.id } }), ctx.store.list("rank_systems", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("ranks", { where: { gym_id: ctx.gym.id }, order: { column: "sort_order" } }), ctx.store.list("techniques", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("testing_events", { where: { gym_id: ctx.gym.id }, order: { column: "starts_at", ascending: false } }), ctx.store.list("testing_registrations", { where: { gym_id: ctx.gym.id } }),
  ]);
  const focus = one(sp.member);
  const rows = [...views.entries()].flatMap(([mid, vs]) => vs.map((v) => ({ m: members.find((x) => x.id === mid), v })))
    .filter((r) => r.m && (!focus || r.m.id === focus) && r.m.status !== "cancelled")
    .sort((a, b) => Number(b.v.eligibility.eligible) - Number(a.v.eligibility.eligible) || b.v.eligibility.progress - a.v.eligibility.progress);
  const here = `/app/ranks${focus ? `?member=${focus}` : ""}`;
  const tabs = [["eligibility", "Promotion eligibility"], ["systems", "Rank systems"], ["curriculum", "Curriculum"], ["testing", "Belt testing"]].map(([k, l]) => ({ key: k, label: l, href: `/app/ranks?tab=${k}` }));

  return (
    <>
      <PageHeader title="Belts & curriculum" subtitle="Eligibility is calculated from attendance and time at rank. Coaches make the final call." />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs tabs={tabs} active={tab} />
      {tab === "eligibility" && (
        <Card>
          <Table head={["Member", "System", "Current", "Progress", "Next", ""]}>
            {rows.slice(0, 80).map(({ m, v }) => (
              <tr key={v.memberRank.id}>
                <td className="td"><Link href={`/app/members/${m!.id}`} className="font-medium hover:underline">{fullName(m)}</Link></td>
                <td className="td text-muted">{v.systemName}</td>
                <td className="td"><Belt color={v.rank.color} stripes={v.memberRank.stripes} name={v.rank.name} /></td>
                <td className="td w-40"><Bar value={v.eligibility.progress} max={1} tone={v.eligibility.eligible ? "ok" : "brand"} /><div className="mt-1 text-xs text-muted">{v.classesAtRank} classes at rank</div></td>
                <td className="td text-sm">{v.eligibility.eligible ? <Badge tone="ok">eligible: {v.eligibility.kind === "stripe" ? "stripe" : v.eligibility.nextRankName}</Badge> : v.eligibility.kind === "none" ? "-" : <span className="text-muted">{v.eligibility.classesNeeded} cls · {v.eligibility.monthsNeeded} mo</span>}</td>
                <td className="td">
                  <div className="flex gap-1">
                    {v.memberRank.stripes < v.rank.max_stripes && <form action={promoteAction}><input type="hidden" name="memberId" value={m!.id} /><input type="hidden" name="systemId" value={v.memberRank.system_id} /><input type="hidden" name="kind" value="stripe" /><input type="hidden" name="back" value={here} /><button className="rounded border border-line px-2 py-1 text-xs">+ Stripe</button></form>}
                    {v.next && <form action={promoteAction}><input type="hidden" name="memberId" value={m!.id} /><input type="hidden" name="systemId" value={v.memberRank.system_id} /><input type="hidden" name="kind" value="belt" /><input type="hidden" name="back" value={here} /><button className="rounded bg-brand px-2 py-1 text-xs font-semibold text-brand-fg">→ {v.next.name}</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      {tab === "systems" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {systems.map((s) => (
            <Card key={s.id} title={s.name}>
              <ol className="space-y-3">{ranks.filter((r) => r.system_id === s.id).map((r) => (
                <li key={r.id}><Belt color={r.color} name={r.name} /><p className="mt-1 text-xs text-muted">{r.min_classes ? `${r.min_classes} classes + ${r.min_months} months at previous rank` : "Starting rank"}{r.classes_per_stripe ? ` · stripe every ${r.classes_per_stripe} classes / ${r.months_per_stripe} mo` : ""}</p>{r.requirements && <p className="text-xs">{r.requirements}</p>}</li>
              ))}</ol>
            </Card>
          ))}
        </div>
      )}
      {tab === "curriculum" && (
        <Card>
          <Table head={["Technique", "Category", "Rank", "Notes", "Video"]}>
            {techniques.map((t) => { const r = ranks.find((x) => x.id === t.rank_id); return <tr key={t.id}><td className="td font-medium">{t.name}</td><td className="td text-muted">{t.category}</td><td className="td">{r ? <Belt color={r.color} name={r.name} /> : "-"}</td><td className="td text-sm">{t.notes}</td><td className="td">{t.video_url ? <a className="underline" href={t.video_url}>Watch</a> : <span className="text-xs text-muted">upload</span>}</td></tr>; })}
          </Table>
        </Card>
      )}
      {tab === "testing" && events.map((e) => (
        <Card key={e.id} className="mb-4" title={<>{e.name} <Badge tone={e.status === "open" ? "ok" : "neutral"}>{e.status}</Badge></>} action={<span className="text-sm text-muted">{dateFmt(e.starts_at, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric" })} · fee {money(e.fee_cents)}</span>}>
          <Table head={["Member", "Testing for", "Paid", "Result", ""]}>
            {regs.filter((r) => r.event_id === e.id).map((r) => (
              <tr key={r.id}>
                <td className="td">{fullName(members.find((m) => m.id === r.member_id))}</td>
                <td className="td">{ranks.find((x) => x.id === r.target_rank_id)?.name}</td>
                <td className="td">{r.paid ? <Badge tone="ok">paid</Badge> : <Badge tone="warn">unpaid</Badge>}</td>
                <td className="td">{r.result ? <Badge tone={r.result === "pass" ? "ok" : "warn"}>{r.result}</Badge> : "-"}</td>
                <td className="td">
                  {!r.result ? <form action={testingResultAction} className="flex gap-1"><input type="hidden" name="registrationId" value={r.id} /><input type="hidden" name="back" value="/app/ranks?tab=testing" /><button name="result" value="pass" className="rounded bg-ok px-2 py-1 text-xs font-semibold text-black">Pass</button><button name="result" value="incomplete" className="rounded border border-line px-2 py-1 text-xs">Not yet</button></form>
                    : r.result === "pass" ? <a className="text-sm underline" href={`/api/certificates/${r.id}`}>Certificate PDF</a> : null}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </>
  );
}
