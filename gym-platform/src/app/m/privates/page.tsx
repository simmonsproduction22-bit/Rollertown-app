import { one, pageCtx, type SP } from "@/lib/ctx";
import { privateSlots } from "@/lib/services/bookings";
import { Card, Flash } from "@/components/ui";
import { addDays } from "@/lib/domain/recurrence";
import { localDate, money } from "@/lib/format";
import { memberBookPrivateAction } from "@/app/actions/member";

export const metadata = { title: "Private lessons" };

export default async function PrivatesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("member.self");
  const tz = ctx.gym.timezone;
  const [coaches, lessonTypes, ents] = await Promise.all([
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id, accepts_privates: true, is_active: true } }),
    ctx.store.list("lesson_types", { where: { gym_id: ctx.gym.id, is_active: true } }),
    s.memberId ? ctx.store.list("entitlements", { where: { member_id: s.memberId, kind: "lesson", status: "active" } }) : Promise.resolve([]),
  ]);
  const coach = coaches.find((c) => c.id === one(sp.coach)) ?? coaches[0];
  const types = lessonTypes.filter((l) => l.coach_id === coach.id && !l.is_intro && l.max_participants === 1);
  const lt = types.find((l) => l.id === one(sp.lt)) ?? types[0];
  const date = one(sp.date) ?? addDays(localDate(new Date(), tz), 1);
  const slots = lt ? await privateSlots(ctx, { coachId: coach.id, lessonTypeId: lt.id, date }) : [];
  const credits = ents.filter((e) => !e.coach_id || e.coach_id === coach.id).reduce((a, e) => a + e.credits_total - e.credits_used, 0);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Private lessons</h1>
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <form className="grid gap-2" method="get">
        <label><span className="label">Coach</span><select name="coach" defaultValue={coach.id} className="input">{coaches.map((c) => <option key={c.id} value={c.id}>{c.display_name}: {c.specialties.slice(0, 2).join(", ")}</option>)}</select></label>
        <label><span className="label">Session</span><select name="lt" defaultValue={lt?.id} className="input">{types.map((l) => <option key={l.id} value={l.id}>{l.name}: {money(l.price_cents)}</option>)}</select></label>
        <label><span className="label">Day</span><input type="date" name="date" defaultValue={date} className="input" /></label>
        <button className="min-h-11 rounded-lg border border-line">Show times</button>
      </form>
      <Card title={`${slots.length} open times`}>
        {lt && slots.length > 0 && (
          <form action={memberBookPrivateAction} className="space-y-3">
            <input type="hidden" name="coachId" value={coach.id} /><input type="hidden" name="lessonTypeId" value={lt.id} />
            <fieldset className="grid grid-cols-3 gap-2"><legend className="sr-only">Time</legend>{slots.map((x, i) => <label key={x.label}><input type="radio" name="startsAt" value={x.start.toISOString()} defaultChecked={i === 0} className="peer sr-only" /><span className="flex min-h-11 items-center justify-center rounded-lg border border-line text-sm peer-checked:border-brand peer-checked:bg-brand/20 peer-focus-visible:ring-2 peer-focus-visible:ring-brand">{x.label}</span></label>)}</fieldset>
            <button className="min-h-12 w-full rounded-lg bg-brand font-semibold text-brand-fg">{credits > 0 ? `Book (uses 1 of your ${credits} credits)` : `Book & pay ${money(lt.price_cents)}`}</button>
          </form>
        )}
        {slots.length === 0 && <p className="text-sm text-muted">No open times that day. Try another day.</p>}
      </Card>
    </div>
  );
}
