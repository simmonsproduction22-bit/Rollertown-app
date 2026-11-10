import { pageCtx } from "@/lib/ctx";
import { fightRecord } from "@/lib/services/people";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { fullName } from "@/lib/format";

export const metadata = { title: "Fight team" };

export default async function FightTeamPage() {
  const { ctx } = await pageCtx("fightteam.view");
  const [fighters, fights, weighIns, camps, docs, events, members] = await Promise.all([
    ctx.store.list("fighters", { where: { gym_id: ctx.gym.id, active: true } }),
    ctx.store.list("fights", { where: { gym_id: ctx.gym.id }, order: { column: "fight_date", ascending: false } }),
    ctx.store.list("weigh_ins", { where: { gym_id: ctx.gym.id }, order: { column: "weighed_on", ascending: false } }),
    ctx.store.list("fight_camps", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("fighter_documents", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("fight_events", { where: { gym_id: ctx.gym.id }, order: { column: "event_date" } }),
    ctx.store.list("members", { where: { gym_id: ctx.gym.id } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const alerts = docs.filter((d) => d.expires_on && d.expires_on <= soon).sort((a, b) => (a.expires_on! < b.expires_on! ? -1 : 1));
  const fname = (fid: string) => { const f = fighters.find((x) => x.id === fid); return `${fullName(members.find((m) => m.id === f?.member_id))}${f?.nickname ? ` "${f.nickname}"` : ""}`; };
  return (
    <>
      <PageHeader title="Fight team" subtitle={`${fighters.length} active fighters · ${fights.filter((f) => !f.result).length} upcoming bouts`} />
      {alerts.length > 0 && (
        <Card className="mb-6 border-warn/50" title="Document alerts">
          <ul className="space-y-1 text-sm">{alerts.map((d) => <li key={d.id}><Badge tone={d.expires_on! < today ? "bad" : "warn"}>{d.expires_on! < today ? "expired" : "expiring"}</Badge> {fname(d.fighter_id)}: {d.title} ({d.expires_on})</li>)}</ul>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fighters.map((f) => {
          const mine = fights.filter((x) => x.fighter_id === f.id);
          const am = fightRecord(mine, "amateur"), pro = fightRecord(mine, "pro");
          const next = mine.filter((x) => !x.result).sort((a, b) => (a.fight_date < b.fight_date ? -1 : 1))[0];
          const wi = weighIns.filter((w) => w.fighter_id === f.id);
          const camp = camps.find((c) => c.fighter_id === f.id && c.ends_on >= today);
          const target = camp?.target_weight_lb ?? wi[0]?.target_lb;
          return (
            <Card key={f.id} title={fname(f.id)} action={f.is_pro ? <Badge tone="brand">pro</Badge> : <Badge>amateur</Badge>}>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-raised p-2"><div className="text-[10px] uppercase text-muted">Amateur</div><div className="text-lg font-bold">{am.text}</div></div>
                <div className="rounded-lg bg-raised p-2"><div className="text-[10px] uppercase text-muted">Pro</div><div className="text-lg font-bold">{pro.text}</div></div>
                <div className="rounded-lg bg-raised p-2"><div className="text-[10px] uppercase text-muted">Walk</div><div className="text-lg font-bold">{wi[0]?.weight_lb ?? f.walk_weight_lb}</div></div>
              </div>
              <p className="mt-3 text-sm text-muted">{f.weight_class} · {f.stance} · {f.disciplines.join(", ")}</p>
              {next && <p className="mt-2 text-sm"><strong>Next:</strong> vs {next.opponent} · {next.event_name} · {next.fight_date}</p>}
              {target && wi.length > 1 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-muted">Weight cut → {target} lb</div>
                  <div className="flex h-16 items-end gap-1" role="img" aria-label={`Weigh-ins: ${wi.map((w) => w.weight_lb).join(", ")} lb`}>
                    {[...wi].reverse().map((w) => { const max = Math.max(...wi.map((x) => x.weight_lb)); return <div key={w.id} className="flex-1 rounded-t bg-brand/70" style={{ height: `${20 + ((w.weight_lb - target + 2) / Math.max(1, max - target + 2)) * 80}%` }} title={`${w.weighed_on}: ${w.weight_lb} lb`} />; })}
                  </div>
                </div>
              )}
              {camp && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Fight camp ({camp.starts_on} → {camp.ends_on})</summary><ul className="mt-2 space-y-1">{camp.plan.map((w) => <li key={w.week}><strong>Wk {w.week}:</strong> {w.focus}<div className="text-xs text-muted">{w.sessions.join(" · ")}</div></li>)}</ul></details>}
              <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Record & documents</summary>
                <ul className="mt-2 space-y-1 text-xs">{mine.filter((x) => x.result).map((x) => <li key={x.id}>{x.fight_date} · {x.result?.toUpperCase()} vs {x.opponent} · {x.method?.replace("_", " ")} R{x.round} {x.time} ({x.level})</li>)}</ul>
                <ul className="mt-2 space-y-1 text-xs">{docs.filter((d) => d.fighter_id === f.id).map((d) => <li key={d.id}>{d.kind}: {d.title}, expires {d.expires_on ?? "n/a"}</li>)}</ul>
              </details>
            </Card>
          );
        })}
      </div>
      <Card className="mt-6" title="Event calendar">
        <Table head={["Date", "Event", "Venue", "Weigh-in", "Our fighters"]}>
          {events.map((e) => <tr key={e.id}><td className="td">{e.event_date}</td><td className="td font-medium">{e.name}</td><td className="td text-muted">{e.venue}, {e.city}</td><td className="td text-sm">{e.weigh_in_at?.slice(0, 16).replace("T", " ") ?? "-"}</td><td className="td text-sm">{fights.filter((f) => f.event_id === e.id).map((f) => fname(f.fighter_id)).join(", ") || "-"}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
