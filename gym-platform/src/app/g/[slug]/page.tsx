import Link from "next/link";
import { one, publicCtx, type SP } from "@/lib/ctx";
import { Card, Flash } from "@/components/ui";
import { dayTimeFmt, money } from "@/lib/format";
import { publicBookAction, publicLeadAction } from "@/app/actions/member";

export const dynamic = "force-dynamic";

/** Public gym page: book a free trial or an intro/private with just an email. */
export default async function GymPublicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await publicCtx(slug);
  const g = ctx.gym;
  const now = new Date().toISOString();
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [sessions, types, coaches, products, locations] = await Promise.all([
    ctx.store.list("class_sessions", { where: { gym_id: g.id, starts_at: { gte: now } }, order: { column: "starts_at" } }),
    ctx.store.list("class_types", { where: { gym_id: g.id } }),
    ctx.store.list("coaches", { where: { gym_id: g.id, is_active: true } }),
    ctx.store.list("products", { where: { gym_id: g.id, is_active: true, is_public: true } }),
    ctx.store.list("locations", { where: { gym_id: g.id } }),
  ]);
  const trialTypes = new Set(types.filter((t) => t.allow_trial).map((t) => t.id));
  const trials = sessions.filter((x) => x.starts_at <= week && trialTypes.has(x.class_type_id) && new Date(x.starts_at).getTime() > Date.now() + 2 * 3_600_000).slice(0, 25);
  const tname = (id: string) => types.find((t) => t.id === id)?.name;

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10">
      <header><h1 className="text-4xl font-black">{g.name}</h1><p className="mt-2 text-muted">{locations.map((l) => `${l.name}: ${l.address}, ${l.city}`).join(" · ")}</p></header>
      <div className="mt-6"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>

      <Card className="mt-6" title="Try a free class">
        <form action={publicBookAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="kind" value="trial" />
          <label className="sm:col-span-2"><span className="label">Class</span><select name="sessionId" required className="input">{trials.map((x) => <option key={x.id} value={x.id}>{tname(x.class_type_id)}: {dayTimeFmt(x.starts_at, g.timezone)}</option>)}</select></label>
          <label><span className="label">Full name</span><input name="name" required autoComplete="name" className="input" /></label>
          <label><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
          <label><span className="label">Mobile (for reminders)</span><input name="phone" type="tel" autoComplete="tel" className="input" /></label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="waiver" required className="mt-1 h-5 w-5" /> I agree to the <a href="#waiver" className="underline">liability waiver</a> (typed-name signature).</label>
          <button className="min-h-12 rounded-lg bg-brand font-semibold text-brand-fg sm:col-span-2">Book free trial, no account needed</button>
        </form>
      </Card>

      <section className="mt-10"><h2 className="text-2xl font-bold">Coaches & private lessons</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">{coaches.map((c) => <Link key={c.id} href={`/g/${slug}/coach/${c.slug}`} className="rounded-xl border border-line bg-surface p-4 hover:border-brand"><div className="font-semibold">{c.display_name}</div><div className="text-sm text-muted">{c.specialties.join(" · ")}</div><div className="mt-2 text-sm font-semibold text-brand">Book a private →</div></Link>)}</div>
      </section>

      <section className="mt-10"><h2 className="text-2xl font-bold">Pricing</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">{products.filter((p) => !["testing_fee", "mat_rent", "retail"].includes(p.kind)).map((p) => <li key={p.id} className="rounded-xl border border-line bg-surface p-4"><div className="flex justify-between font-semibold"><span>{p.name}</span><span>{p.price_cents ? money(p.price_cents) : "Free"}{p.interval ? `/${p.interval}` : ""}</span></div>{p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}{p.coach_id && <p className="mt-1 text-xs text-muted">Sold by {coaches.find((c) => c.id === p.coach_id)?.display_name}</p>}</li>)}</ul>
      </section>

      <section className="mt-10"><h2 className="text-2xl font-bold">This week</h2>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">{sessions.filter((x) => x.starts_at <= week).slice(0, 30).map((x) => <li key={x.id} className="flex justify-between px-4 py-2 text-sm"><span>{tname(x.class_type_id)}</span><span className="text-muted">{dayTimeFmt(x.starts_at, g.timezone)}</span></li>)}</ul>
      </section>

      <Card className="mt-10" title="Questions? Leave your number">
        <form action={publicLeadAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="slug" value={slug} />
          <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label><span className="label">First name</span><input name="firstName" required className="input" /></label><label><span className="label">Last name</span><input name="lastName" className="input" /></label>
          <label><span className="label">Email</span><input name="email" type="email" className="input" /></label><label><span className="label">Phone</span><input name="phone" type="tel" className="input" /></label>
          <label className="sm:col-span-2"><span className="label">What are you interested in?</span><input name="interest" className="input" placeholder="BJJ, Muay Thai, kids program…" /></label>
          <button className="min-h-11 rounded-lg border border-line sm:col-span-2">Send</button>
        </form>
      </Card>
      <details id="waiver" className="mt-6 text-sm text-muted"><summary className="cursor-pointer">Liability waiver</summary><WaiverText ctxSlug={slug} /></details>
    </main>
  );
}

async function WaiverText({ ctxSlug }: { ctxSlug: string }) {
  const ctx = await publicCtx(ctxSlug);
  const w = (await ctx.store.list("waiver_templates", { where: { gym_id: ctx.gym.id, is_current: true } }))[0];
  return <pre className="mt-2 whitespace-pre-wrap">{w?.body}</pre>;
}
