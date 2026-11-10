import { one, pageCtx, type SP } from "@/lib/ctx";
import { staffCheckInAction } from "@/app/actions/staff";
import { kioskQrAction } from "@/app/actions/member";
import { fullName, timeFmt } from "@/lib/format";

export const metadata = { title: "Kiosk" };
export const dynamic = "force-dynamic";

/** Front-desk tablet mode. Big targets, search by name, or scan a member QR (scanners type + Enter). */
export default async function Kiosk({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { ctx } = await pageCtx("checkin.kiosk");
  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const tz = ctx.gym.timezone;
  const now = Date.now();
  const [members, sessions, types] = await Promise.all([
    ctx.store.list("members", { where: { gym_id: ctx.gym.id }, order: { column: "first_name" } }),
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id, starts_at: { gte: new Date(now - 30 * 60_000).toISOString() } }, order: { column: "starts_at" }, limit: 3 }),
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
  ]);
  const matches = q.length >= 2 ? members.filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) && m.status !== "cancelled").slice(0, 8) : [];
  const msg = one(sp.msg), err = one(sp.err);
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8">
      <h1 className="text-center text-3xl font-black">{ctx.gym.name}</h1>
      <p className="mt-1 text-center text-muted">Next up: {sessions.map((s) => `${types.find((t) => t.id === s.class_type_id)?.name} ${timeFmt(s.starts_at, tz)}`).join(" · ") || "no classes soon"}</p>
      {(msg || err) && <div role="status" aria-live="assertive" className={`mt-6 rounded-2xl p-6 text-center text-2xl font-bold ${err ? "bg-bad/20 text-bad" : "bg-ok/20 text-ok"}`}>{err ?? msg}</div>}
      <form className="mt-8" role="search"><label className="sr-only" htmlFor="q">Your name</label><input id="q" name="q" defaultValue={q} autoFocus autoComplete="off" placeholder="Type your name…" className="input min-h-16 text-center text-2xl" /></form>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <li key={m.id}><form action={staffCheckInAction}><input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="method" value="kiosk" /><input type="hidden" name="back" value="/kiosk" />
            <button className="min-h-20 w-full rounded-2xl border-2 border-line bg-surface px-4 text-xl font-bold hover:border-brand focus-visible:border-brand">{fullName(m)}</button></form></li>
        ))}
        {q.length >= 2 && matches.length === 0 && <li className="text-center text-muted sm:col-span-2">No match. Ask the front desk.</li>}
      </ul>
      <form action={kioskQrAction} className="mt-auto pt-10"><label className="block text-center text-sm text-muted" htmlFor="token">Or scan your QR code from the member app</label><input id="token" name="token" autoComplete="off" className="input mt-2 text-center font-mono" placeholder="QR scanner input" /></form>
    </main>
  );
}
