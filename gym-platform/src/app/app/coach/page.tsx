import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { coachDashboard } from "@/lib/services/people";
import { privateSlots } from "@/lib/services/bookings";
import { Badge, Bar, Card, Flash, PageHeader, Stat, Table } from "@/components/ui";
import { dateFmt, dayTimeFmt, fullName, localDate, money } from "@/lib/format";
import { formatBps } from "@/lib/domain/money";
import { bookPrivateStaffAction, cancelBookingAction } from "@/app/actions/staff";
import { addDays } from "@/lib/domain/recurrence";
import { can } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export const metadata = { title: "My coaching" };

export default async function CoachPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx();
  if (!can(s.role, "coach.self") && !can(s.role, "reports.view")) redirect("/forbidden");
  const coachId = one(sp.coach) && ["owner", "manager"].includes(s.role) ? one(sp.coach)! : s.coachId;
  if (!coachId) return <PageHeader title="My coaching" subtitle="Your account isn't linked to a coach profile yet." />;
  const d = await coachDashboard(ctx, coachId);
  const tz = ctx.gym.timezone;
  const members = await ctx.store.list("members", { where: { gym_id: ctx.gym.id }, order: { column: "last_name" } });
  const lt = d.lessonTypes.find((x) => x.id === one(sp.lt)) ?? d.lessonTypes.find((x) => !x.is_intro) ?? d.lessonTypes[0];
  const date = one(sp.date) ?? addDays(localDate(new Date(), tz), 1);
  const slots = lt ? await privateSlots(ctx, { coachId, lessonTypeId: lt.id, date }) : [];
  const ltName = (id: string) => d.lessonTypes.find((x) => x.id === id)?.name ?? "Private";
  const here = `/app/coach${coachId !== s.coachId ? `?coach=${coachId}` : ""}`;

  return (
    <>
      <PageHeader title={d.coach.display_name} subtitle={<>{d.coach.employment === "independent" ? "Independent coach" : "Staff coach"} · you keep {formatBps(d.coach.default_coach_split_bps)} of net sales{d.coach.rent_model !== "none" ? ` · rent ${money(d.coach.rent_amount_cents)} ${d.coach.rent_model.replace("_", " ")}` : ""} · <Link className="underline" href={`/g/${ctx.gym.slug}/coach/${d.coach.slug}`}>public booking page</Link></>} />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Earned this month" value={money(d.earnedThisMonth)} hint="Net of refunds" />
        <Stat label="Next payout" value={d.nextPayout ? money(d.nextPayout.amount_cents) : "-"} hint={d.nextPayout ? `${d.nextPayout.status.replace("_", " ")} · ${d.nextPayout.arrival_date}` : "Stripe Connect"} />
        <Stat label="Clients" value={d.clients.length} hint={`${d.packages.length} active packages`} />
        <Stat label="Rent due" value={money(d.rentDue)} hint="Deducted from next payout" tone={d.rentDue ? "warn" : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Upcoming privates">
          <ul className="divide-y divide-line">
            {d.upcoming.slice(0, 10).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><div className="font-medium">{b.participants.map((p) => fullName(members.find((m) => m.id === p.member_id))).join(" + ") || b.booked_by_name}</div><div className="text-muted">{dayTimeFmt(b.starts_at, tz)} · {ltName(b.lesson_type_id)}{b.booked_by_email && !b.participants.length ? ` · ${b.booked_by_email}` : ""}</div></div>
                <form action={cancelBookingAction}><input type="hidden" name="kind" value="private" /><input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="back" value={here} /><button className="rounded border border-line px-2 py-1 text-xs">Cancel</button></form>
              </li>
            ))}
            {d.upcoming.length === 0 && <li className="py-3 text-sm text-muted">Nothing booked.</li>}
          </ul>
        </Card>
        <Card title="Book a private">
          <form className="space-y-2" method="get">
            {coachId !== s.coachId && <input type="hidden" name="coach" value={coachId} />}
            <select name="lt" defaultValue={lt?.id} className="input" aria-label="Lesson type">{d.lessonTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input type="date" name="date" defaultValue={date} className="input" aria-label="Date" />
            <button className="min-h-11 w-full rounded-lg border border-line text-sm">Show times</button>
          </form>
          {lt && (
            <form action={bookPrivateStaffAction} className="mt-3 space-y-2">
              <input type="hidden" name="coachId" value={coachId} /><input type="hidden" name="lessonTypeId" value={lt.id} /><input type="hidden" name="back" value={here} />
              <fieldset className="flex flex-wrap gap-1"><legend className="label">Time</legend>{slots.slice(0, 16).map((x, i) => <label key={x.label} className="cursor-pointer"><input type="radio" name="startsAt" value={x.start.toISOString()} defaultChecked={i === 0} className="peer sr-only" /><span className="block rounded border border-line px-2 py-1 text-xs peer-checked:border-brand peer-checked:bg-brand/20">{x.label}</span></label>)}{slots.length === 0 && <span className="text-xs text-muted">No open times.</span>}</fieldset>
              {Array.from({ length: lt.max_participants }, (_, i) => <select key={i} name="memberId" className="input" required={i === 0} aria-label={`Client ${i + 1}`}><option value="">{i === 0 ? "Client" : `Partner ${i} (optional)`}</option>{members.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</select>)}
              <button className="min-h-11 w-full rounded-lg bg-brand text-sm font-semibold text-brand-fg" disabled={!slots.length}>Book (uses credits, else charges card)</button>
            </form>
          )}
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Client package balances">
          <ul className="space-y-3">{d.packages.map((e) => <li key={e.id} className="text-sm"><div className="flex justify-between"><span>{fullName(members.find((m) => m.id === e.member_id))}</span><span className="tabular-nums">{e.credits_total - e.credits_used}/{e.credits_total}</span></div><Bar value={e.credits_total - e.credits_used} max={e.credits_total} /></li>)}</ul>
        </Card>
        <Card title="My products">
          <ul className="space-y-1 text-sm">{d.products.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span>{money(p.price_cents)} <Badge>{formatBps(p.coach_split_bps ?? d.coach.default_coach_split_bps)} to you</Badge></span></li>)}{d.lessonTypes.map((l) => <li key={l.id} className="flex justify-between text-muted"><span>{l.name}</span><span>{l.max_participants > 1 ? `${money(l.per_person_price_cents ?? 0)}/person` : money(l.price_cents)}</span></li>)}</ul>
        </Card>
      </div>
      <Card className="mt-6" title="Payout history">
        <Table head={["Arrival", "Amount", "Status"]}>{d.payouts.slice(0, 8).map((p) => <tr key={p.id}><td className="td">{p.arrival_date}</td><td className="td tabular-nums">{money(p.amount_cents)}</td><td className="td"><Badge tone={p.status === "paid" ? "ok" : "neutral"}>{p.status.replace("_", " ")}</Badge></td></tr>)}</Table>
        <p className="mt-2 text-xs text-muted">Rent collected: {d.rent.filter((r) => r.status === "collected").map((r) => `${dateFmt(r.period_start, tz)} ${money(r.amount_cents)}`).join(" · ") || "none"}</p>
      </Card>
    </>
  );
}
