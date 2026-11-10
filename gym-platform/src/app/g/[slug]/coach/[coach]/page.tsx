import Link from "next/link";
import { notFound } from "next/navigation";
import { one, publicCtx, type SP } from "@/lib/ctx";
import { privateSlots } from "@/lib/services/bookings";
import { Card, Flash } from "@/components/ui";
import { addDays } from "@/lib/domain/recurrence";
import { localDate, money } from "@/lib/format";
import { publicBookAction } from "@/app/actions/member";

export const dynamic = "force-dynamic";

/** Coach public profile + booking with just an email (privates, partner, intro). */
export default async function CoachPublicPage({ params, searchParams }: { params: Promise<{ slug: string; coach: string }>; searchParams: SP }) {
  const { slug, coach: coachSlug } = await params;
  const sp = await searchParams;
  const ctx = await publicCtx(slug);
  const coach = await ctx.store.first("coaches", { where: { gym_id: ctx.gym.id, slug: coachSlug } });
  if (!coach) notFound();
  const [types, products] = await Promise.all([
    ctx.store.list("lesson_types", { where: { coach_id: coach.id, is_active: true } }),
    ctx.store.list("products", { where: { coach_id: coach.id, is_active: true } }),
  ]);
  const lt = types.find((t) => t.id === one(sp.lt)) ?? types.find((t) => t.is_intro) ?? types[0];
  const date = one(sp.date) ?? addDays(localDate(new Date(), ctx.gym.timezone), 1);
  const slots = lt ? await privateSlots(ctx, { coachId: coach.id, lessonTypeId: lt.id, date }) : [];
  const here = `/g/${slug}/coach/${coachSlug}`;
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/g/${slug}`} className="text-sm text-muted underline">← {ctx.gym.name}</Link>
      <h1 className="mt-3 text-4xl font-black">{coach.display_name}</h1>
      <p className="mt-2 text-muted">{coach.bio}</p>
      <p className="mt-1 text-sm">{coach.specialties.join(" · ")}{coach.employment === "independent" ? ` · independent coach at ${ctx.gym.name}` : ""}</p>
      <div className="mt-6"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <Card className="mt-4" title="Book a session">
        <form method="get" className="grid gap-2 sm:grid-cols-3">
          <select name="lt" defaultValue={lt?.id} className="input sm:col-span-2" aria-label="Session type">{types.map((t) => <option key={t.id} value={t.id}>{t.name}: {t.max_participants > 1 ? `${money(t.per_person_price_cents ?? 0)}/person (up to ${t.max_participants})` : money(t.price_cents)}</option>)}</select>
          <input type="date" name="date" defaultValue={date} className="input" aria-label="Date" />
          <button className="min-h-11 rounded-lg border border-line sm:col-span-3">Check availability</button>
        </form>
        {lt && (
          <form action={publicBookAction} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="kind" value="private" /><input type="hidden" name="coachId" value={coach.id} /><input type="hidden" name="lessonTypeId" value={lt.id} /><input type="hidden" name="back" value={here} />
            <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-5"><legend className="label">Pick a time</legend>{slots.map((x, i) => <label key={x.label}><input type="radio" name="startsAt" value={x.start.toISOString()} defaultChecked={i === 0} className="peer sr-only" /><span className="flex min-h-11 items-center justify-center rounded-lg border border-line text-sm peer-checked:border-brand peer-checked:bg-brand/20">{x.label}</span></label>)}</fieldset>
            {slots.length === 0 && <p className="text-sm text-muted">No open times that day.</p>}
            <div className="grid gap-3 sm:grid-cols-3"><label><span className="label">Name</span><input name="name" required className="input" /></label><label><span className="label">Email</span><input name="email" type="email" required className="input" /></label><label><span className="label">Phone</span><input name="phone" type="tel" className="input" /></label></div>
            <button disabled={!slots.length} className="min-h-12 w-full rounded-lg bg-brand font-semibold text-brand-fg">Book & pay {money(lt.max_participants > 1 ? lt.per_person_price_cents ?? lt.price_cents : lt.price_cents)}</button>
            <p className="text-xs text-muted">No account needed. Free cancellation up to {ctx.gym.settings.cancellation.window_hours}h before, with an automatic refund.</p>
          </form>
        )}
      </Card>
      {products.length > 0 && <Card className="mt-6" title="Packages"><ul className="space-y-2">{products.map((p) => <li key={p.id} className="flex justify-between text-sm"><span>{p.name}</span><span className="font-semibold">{money(p.price_cents)}</span></li>)}</ul><p className="mt-2 text-xs text-muted">Buy packages from the member app after your first session.</p></Card>}
    </main>
  );
}
