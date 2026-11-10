import Link from "next/link";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { Badge, Card, Flash, PageHeader, Tabs, cx } from "@/components/ui";
import { localDate, timeFmt, fullName } from "@/lib/format";
import { addDays } from "@/lib/domain/recurrence";
import { bookForMemberAction, cancelBookingAction } from "@/app/actions/staff";
import type { ClassSession } from "@/lib/data/types";

export const metadata = { title: "Schedule" };
type View = "day" | "week" | "coach" | "room";

export default async function SchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { ctx } = await pageCtx("bookings.manage");
  const tz = ctx.gym.timezone;
  const view = (one(sp.view) as View) ?? "week";
  const date = one(sp.date) ?? localDate(new Date(), tz);
  const days = view === "day" ? 1 : 7;
  const start = view === "day" ? date : addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  const from = new Date(`${start}T00:00:00Z`).getTime() - 86_400_000;
  const to = from + (days + 2) * 86_400_000;

  const [sessions, types, coaches, rooms, privates, lessonTypes] = await Promise.all([
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id }, order: { column: "starts_at" } }),
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("rooms", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("private_bookings", { where: { gym_id: ctx.gym.id, status: "confirmed" }, order: { column: "starts_at" } }),
    ctx.store.list("lesson_types", { where: { gym_id: ctx.gym.id } }),
  ]);
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const visible = sessions.filter((x) => inRange(x.starts_at) && dayList.includes(localDate(new Date(x.starts_at), tz)));
  const visPriv = privates.filter((x) => inRange(x.starts_at) && dayList.includes(localDate(new Date(x.starts_at), tz)));
  const bookings = visible.length ? await ctx.store.list("class_bookings", { where: { session_id: { in: visible.map((x) => x.id) } } }) : [];
  const selected = one(sp.session) ? sessions.find((x) => x.id === one(sp.session)) : null;
  const selBookings = selected ? await ctx.store.list("class_bookings", { where: { session_id: selected.id } }) : [];
  const members = selected ? await ctx.store.list("members", { where: { gym_id: ctx.gym.id }, order: { column: "last_name" } }) : [];
  const qs = (p: Record<string, string>) => `/app/schedule?${new URLSearchParams({ view, date, ...p }).toString()}`;

  const group: { key: string; label: string; items: ClassSession[] }[] =
    view === "coach" ? coaches.map((c) => ({ key: c.id, label: c.display_name, items: visible.filter((x) => x.coach_id === c.id) }))
    : view === "room" ? rooms.map((r) => ({ key: r.id, label: r.name, items: visible.filter((x) => x.room_id === r.id) }))
    : dayList.map((d) => ({ key: d, label: new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }), items: visible.filter((x) => localDate(new Date(x.starts_at), tz) === d) }));

  const Session = ({ x }: { x: ClassSession }) => {
    const t = types.find((y) => y.id === x.class_type_id);
    const b = bookings.filter((y) => y.session_id === x.id);
    const n = b.filter((y) => ["booked", "attended"].includes(y.status)).length;
    const w = b.filter((y) => y.status === "waitlisted").length;
    return (
      <Link href={qs({ session: x.id })} className="block rounded-lg border-l-4 bg-raised p-2 text-sm hover:brightness-125" style={{ borderColor: t?.color }}>
        <div className="font-semibold">{t?.name}</div>
        <div className="text-xs text-muted">{timeFmt(x.starts_at, tz)} · {coaches.find((c) => c.id === x.coach_id)?.display_name.split(" ")[0]} · {rooms.find((r) => r.id === x.room_id)?.name}</div>
        <div className="mt-1 flex gap-1 text-xs"><span className={cx("tabular-nums", n >= x.capacity && "text-warn")}>{n}/{x.capacity}</span>{w > 0 && <Badge tone="warn">+{w} wait</Badge>}</div>
      </Link>
    );
  };

  return (
    <>
      <PageHeader title="Schedule" subtitle="Classes and private lessons. Click a class to manage its roster."
        actions={<><Link className="rounded-lg border border-line px-3 py-2 text-sm" href={qs({ date: addDays(start, -days) })}>← Prev</Link><Link className="rounded-lg border border-line px-3 py-2 text-sm" href={qs({ date: localDate(new Date(), tz) })}>Today</Link><Link className="rounded-lg border border-line px-3 py-2 text-sm" href={qs({ date: addDays(start, days) })}>Next →</Link></>} />
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <Tabs active={view} tabs={(["day", "week", "coach", "room"] as View[]).map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: `/app/schedule?view=${v}&date=${date}` }))} />
      <div className={cx("grid gap-3", view === "day" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-4 xl:grid-cols-7")}>
        {group.map((g) => (
          <section key={g.key} aria-label={g.label} className="min-w-0">
            <h2 className="mb-2 text-sm font-semibold text-muted">{g.label}</h2>
            <div className="space-y-2">
              {g.items.map((x) => <Session key={x.id} x={x} />)}
              {visPriv.filter((p) => view === "coach" ? p.coach_id === g.key : view === "room" ? p.room_id === g.key : localDate(new Date(p.starts_at), tz) === g.key).map((p) => (
                <div key={p.id} className="rounded-lg border border-dashed border-line p-2 text-xs">
                  <div className="font-semibold">Private · {coaches.find((c) => c.id === p.coach_id)?.display_name.split(" ")[0]}</div>
                  <div className="text-muted">{timeFmt(p.starts_at, tz)} · {lessonTypes.find((l) => l.id === p.lesson_type_id)?.name}</div>
                </div>
              ))}
              {g.items.length === 0 && <p className="text-xs text-muted">-</p>}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <Card className="mt-6" title={`${types.find((t) => t.id === selected.class_type_id)?.name}: ${timeFmt(selected.starts_at, tz)} roster`} action={<Link href={qs({})} className="text-sm underline">Close</Link>}>
          <ul className="divide-y divide-line">
            {selBookings.sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0)).map((b) => {
              const m = members.find((x) => x.id === b.member_id);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/app/members/${b.member_id}`} className="font-medium hover:underline">{fullName(m)}</Link>
                  <span className="flex items-center gap-2">
                    <Badge tone={b.status === "attended" ? "ok" : b.status === "waitlisted" ? "warn" : b.status.includes("cancel") || b.status === "no_show" ? "bad" : "neutral"}>{b.status.replace("_", " ")}{b.waitlist_position ? ` #${b.waitlist_position}` : ""}</Badge>
                    {b.is_trial && <Badge tone="brand">trial</Badge>}
                    {["booked", "waitlisted"].includes(b.status) && (
                      <form action={cancelBookingAction} className="flex items-center gap-1">
                        <input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="back" value={qs({ session: selected.id })} />
                        <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="override" /> waive fee</label>
                        <button className="rounded border border-line px-2 py-1 text-xs hover:border-bad">Cancel</button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <form action={bookForMemberAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="sessionId" value={selected.id} /><input type="hidden" name="back" value={qs({ session: selected.id })} />
            <label className="min-w-64 flex-1"><span className="label">Add member</span>
              <select name="memberId" className="input" required>{members.filter((m) => !selBookings.some((b) => b.member_id === m.id)).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="trial" /> Free trial</label>
            <button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">Book</button>
          </form>
        </Card>
      )}
    </>
  );
}
