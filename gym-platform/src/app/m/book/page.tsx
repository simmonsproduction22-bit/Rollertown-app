import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { familyScope } from "@/lib/member-scope";
import { Badge, Flash } from "@/components/ui";
import { dateFmt, localDate, timeFmt } from "@/lib/format";
import { memberBookAction } from "@/app/actions/member";

export const metadata = { title: "Book a class" };

export default async function BookPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("member.self");
  const { people, active } = await familyScope(ctx, s, one(sp.p));
  if (!active) return null;
  const tz = ctx.gym.timezone;
  const horizon = new Date(Date.now() + ctx.gym.settings.booking.open_days_ahead * 86_400_000).toISOString();
  const [sessions, types, coaches, mine] = await Promise.all([
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id, starts_at: { gte: new Date().toISOString() } }, order: { column: "starts_at" } }),
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("class_bookings", { where: { member_id: active.id } }),
  ]);
  const age = active.date_of_birth ? Math.floor((Date.now() - new Date(active.date_of_birth).getTime()) / 31_557_600_000) : 30;
  const eligibleTypes = new Set(types.filter((t) => (t.is_kids ? age >= (t.age_min ?? 0) && age <= (t.age_max ?? 99) : age >= 14) && !t.requires_rank_order).map((t) => t.id));
  const list = sessions.filter((x) => x.starts_at <= horizon && !x.is_cancelled && eligibleTypes.has(x.class_type_id)).slice(0, 40);
  const counts = list.length ? await ctx.store.list("class_bookings", { where: { session_id: { in: list.map((x) => x.id) }, status: { in: ["booked", "attended"] } } }) : [];
  const byDay = new Map<string, typeof list>();
  list.forEach((x) => { const d = localDate(new Date(x.starts_at), tz); byDay.set(d, [...(byDay.get(d) ?? []), x]); });
  const back = `/m/book${one(sp.p) ? `?p=${active.id}` : ""}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Book a class</h1>
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      {people.length > 1 && <nav className="flex gap-2">{people.map((p) => <Link key={p.id} href={`/m/book?p=${p.id}`} className={`rounded-full border px-4 py-2 text-sm ${p.id === active.id ? "border-brand bg-brand/15" : "border-line"}`}>{p.first_name}</Link>)}</nav>}
      {[...byDay.entries()].map(([day, xs]) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 text-sm font-semibold text-muted">{dateFmt(`${day}T12:00:00Z`, "UTC", { weekday: "long", month: "short", day: "numeric" })}</h2>
          <ul className="space-y-2">
            {xs.map((x) => {
              const t = types.find((y) => y.id === x.class_type_id)!;
              const taken = counts.filter((c) => c.session_id === x.id).length;
              const my = mine.find((b) => b.session_id === x.id && ["booked", "waitlisted"].includes(b.status));
              return (
                <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <span className="h-12 w-1.5 rounded" style={{ background: t.color }} />
                  <div className="flex-1"><div className="font-semibold">{t.name}</div><div className="text-sm text-muted">{timeFmt(x.starts_at, tz)} · {coaches.find((c) => c.id === x.coach_id)?.display_name.split(" ")[0]} · {Math.max(0, x.capacity - taken)} spots</div></div>
                  {my ? <Badge tone={my.status === "booked" ? "ok" : "warn"}>{my.status === "booked" ? "Booked" : `Waitlist #${my.waitlist_position}`}</Badge> : (
                    <form action={memberBookAction}><input type="hidden" name="sessionId" value={x.id} /><input type="hidden" name="memberId" value={active.id} /><input type="hidden" name="back" value={back} />
                      <button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">{taken >= x.capacity ? "Join waitlist" : "Book"}</button></form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
