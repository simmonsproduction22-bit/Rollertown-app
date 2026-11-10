import Link from "next/link";
import QRCode from "qrcode";
import { one, pageCtx, type SP } from "@/lib/ctx";
import { familyScope } from "@/lib/member-scope";
import { qrToken } from "@/lib/services/checkin";
import { rankViews } from "@/lib/services/ranks";
import { waiverStatus, isMinor } from "@/lib/services/waivers";
import { Bar, Belt, Card, Flash } from "@/components/ui";
import { SignaturePad } from "@/components/signature-pad";
import { dayTimeFmt, dateFmt } from "@/lib/format";
import { memberCancelAction, signWaiverAction } from "@/app/actions/member";

export const metadata = { title: "My gym" };

export default async function MemberHome({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { s, ctx } = await pageCtx("member.self");
  const { people, active } = await familyScope(ctx, s, one(sp.p));
  if (!active) return <p>No member profile is linked to this account yet.</p>;
  const tz = ctx.gym.timezone;
  const nowIso = new Date().toISOString();
  const [bookings, sessions, types, ents, products, privParts, waivers, ranks] = await Promise.all([
    ctx.store.list("class_bookings", { where: { member_id: active.id, status: { in: ["booked", "waitlisted"] } } }),
    ctx.store.list("class_sessions", { where: { gym_id: ctx.gym.id, starts_at: { gte: nowIso } } }),
    ctx.store.list("class_types", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("entitlements", { where: { member_id: active.id, status: "active" } }),
    ctx.store.list("products", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("private_booking_participants", { where: { member_id: active.id } }),
    waiverStatus(ctx, active.id),
    rankViews(ctx, [active.id]),
  ]);
  const privates = privParts.length ? (await ctx.store.list("private_bookings", { where: { id: { in: privParts.map((p) => p.booking_id) }, status: "confirmed" } })).filter((p) => p.starts_at >= nowIso) : [];
  const upcoming = bookings.map((b) => ({ b, x: sessions.find((y) => y.id === b.session_id) })).filter((r) => r.x).sort((a, b) => (a.x!.starts_at < b.x!.starts_at ? -1 : 1));
  const qr = await QRCode.toString(qrToken(active.id), { type: "svg", margin: 1, width: 220 });
  const minor = isMinor(active, new Date());
  const tpl = waivers.missing[0];

  return (
    <div className="space-y-4">
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      {people.length > 1 && <nav aria-label="Family" className="flex gap-2 overflow-x-auto">{people.map((p) => <Link key={p.id} href={`/m?p=${p.id}`} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${p.id === active.id ? "border-brand bg-brand/15" : "border-line"}`}>{p.first_name}</Link>)}</nav>}
      <h1 className="text-2xl font-bold">Hi, {active.first_name}</h1>

      {tpl && (
        <Card title={waivers.needsResign ? `Our waiver was updated: please re-sign (v${tpl.version})` : "Sign the waiver to book"}>
          <details><summary className="cursor-pointer text-sm underline">Read the waiver</summary><pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-muted">{tpl.body}</pre></details>
          <form action={signWaiverAction} className="mt-3 space-y-3">
            <input type="hidden" name="templateId" value={tpl.id} /><input type="hidden" name="memberId" value={active.id} />
            <input type="hidden" name="relationship" value={minor ? "parent" : "self"} />
            <label className="block"><span className="label">{minor ? "Parent/guardian full name" : "Full name"}</span><input name="signerName" required className="input" defaultValue={minor ? s.name : `${active.first_name} ${active.last_name}`} /></label>
            <SignaturePad />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1 h-5 w-5" /> I have read and agree to this waiver{minor ? ` on behalf of ${active.first_name}` : ""}.</label>
            <button className="min-h-12 w-full rounded-lg bg-brand font-semibold text-brand-fg">Sign waiver</button>
          </form>
        </Card>
      )}

      <Card title="Check-in code">
        <div className="mx-auto w-56 rounded-xl bg-white p-2" role="img" aria-label="Your check-in QR code" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-2 text-center text-xs text-muted">Show this at the kiosk. Refreshes daily.</p>
      </Card>

      <Card title="Coming up" action={<Link href="/m/book" className="text-sm underline">Book</Link>}>
        <ul className="divide-y divide-line">
          {upcoming.map(({ b, x }) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-3">
              <div><div className="font-medium">{types.find((t) => t.id === x!.class_type_id)?.name}</div><div className="text-sm text-muted">{dayTimeFmt(x!.starts_at, tz)}{b.status === "waitlisted" ? ` · waitlist #${b.waitlist_position}` : ""}</div></div>
              <form action={memberCancelAction}><input type="hidden" name="bookingId" value={b.id} /><button className="min-h-11 rounded-lg border border-line px-3 text-sm">Cancel</button></form>
            </li>
          ))}
          {privates.map((p) => <li key={p.id} className="flex items-center justify-between py-3"><div><div className="font-medium">Private lesson</div><div className="text-sm text-muted">{dayTimeFmt(p.starts_at, tz)}</div></div><form action={memberCancelAction}><input type="hidden" name="kind" value="private" /><input type="hidden" name="bookingId" value={p.id} /><button className="min-h-11 rounded-lg border border-line px-3 text-sm">Cancel</button></form></li>)}
          {upcoming.length + privates.length === 0 && <li className="py-3 text-sm text-muted">Nothing booked yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted">Free cancellation up to {ctx.gym.settings.cancellation.window_hours}h before. After that, a ${(ctx.gym.settings.cancellation.late_cancel_fee_cents / 100).toFixed(0)} late fee applies.</p>
      </Card>

      {ents.length > 0 && <Card title="My packages"><ul className="space-y-3">{ents.map((e) => <li key={e.id}><div className="flex justify-between text-sm"><span>{products.find((p) => p.id === e.product_id)?.name}</span><span className="font-semibold">{e.credits_total - e.credits_used} left</span></div><Bar value={e.credits_total - e.credits_used} max={e.credits_total} />{e.expires_at && <div className="mt-1 text-xs text-muted">Expires {dateFmt(e.expires_at, tz)}</div>}</li>)}</ul></Card>}

      <Card title="Belt progress">
        <ul className="space-y-4">{(ranks.get(active.id) ?? []).map((r) => <li key={r.memberRank.id}><div className="text-xs text-muted">{r.systemName}</div><Belt color={r.rank.color} stripes={r.memberRank.stripes} name={r.rank.name} /><div className="mt-2"><Bar value={r.eligibility.progress} max={1} tone={r.eligibility.eligible ? "ok" : "brand"} /></div><p className="mt-1 text-xs text-muted">{r.eligibility.eligible ? "You're eligible! Your coach will decide when." : r.eligibility.kind === "none" ? "Top rank" : `About ${r.eligibility.classesNeeded} more classes to your next ${r.eligibility.kind === "stripe" ? "stripe" : "belt"}`}</p></li>)}</ul>
      </Card>
    </div>
  );
}
