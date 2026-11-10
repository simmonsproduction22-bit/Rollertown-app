import Link from "next/link";
import { LinkButton } from "@/components/ui";

const PRICE = 149;
const FEE = "3%";

const compare = [
  ["Pricing", "Tiered plans; features gated behind upgrades", `One price: $${PRICE}/mo, everything included`],
  ["Marketplace / new-client fees", "Commissions on clients from their marketplace", "None. Your clients are yours."],
  ["Paid listings & boosted ads", "Pay to rank higher", "None. Not even an option."],
  ["Transaction fee", "Often bundled + hard to find", `${FEE}, shown on every receipt and report`],
  ["Getting your data out", "Exports by request, sometimes fees", "One click, anytime, free. CSVs + waiver PDFs."],
  ["Switching", "You re-enter cards; members re-sign up", "Free card-on-file migration + import wizard"],
  ["Refunds", "Manual, splits don't reverse", "One tap. Coach & gym splits reverse automatically."],
  ["Sales call to sign up", "Usually", "Never (only 5+ location businesses talk to us)"],
];

const features = [
  ["Schedule & bookings", "Recurring classes, capacity, waitlists that auto-promote, drop-ins, free trials, kids age groups."],
  ["Private lessons", "Coach availability, buffers, 30/45/60-min sessions, rooms (mat, cage, ring), partner & small-group pricing."],
  ["Memberships & packs", "Autopay, class & lesson packs with expirations, holds, family plans, sibling discounts, intro offers."],
  ["Waivers", "Digital signatures, parents sign for minors, versioning with re-sign, PDF per member."],
  ["Check-in", "Front-desk kiosk and QR codes from the member app. Pickup notes pop up for kids."],
  ["Member app", "Book, cancel within policy, pay, see credits and belt progress. Installs to the home screen."],
  ["SMS & email included", "Two-way texting inbox, reminders, lead follow-ups, win-back texts. No per-message add-on."],
  ["Reports", "Revenue, attendance, retention & churn, coach payouts, package liability."],
  ["Point of sale", "Gloves, gis, drinks. Simple inventory with low-stock alerts."],
  ["Public API & webhooks", "REST API keys and signed webhooks for bookings, payments and check-ins."],
];

const faq = [
  ["Is there really only one plan?", `Yes. $${PRICE}/month per location gets every feature: SMS, automations, fight team tools, API, all of it. Businesses with 5+ locations can contact us for volume pricing.`],
  ["What is the 3% fee?", "It's our only transaction fee, on card payments processed through the platform. It's shown at checkout and in every report, and it covers card processing. You choose whether the gym absorbs it or passes it on."],
  ["Do you take a cut when new clients find us?", "No. No marketplace commissions, no 'new client' percentage, no boosted listings. Clients who book on your page are your clients."],
  ["How do you move our members' cards?", "We request a secure card-data transfer from your current processor straight into Stripe. Card numbers never touch our servers, and members never re-enter cards. You see the progress in a tracker."],
  ["Can independent coaches use it inside our gym?", "Yes. Coaches sell their own privates and packages under your gym. Revenue splits automatically at checkout, mat rent is collected automatically, and both sides get their own dashboard."],
  ["What if we leave?", "Download everything (members, payments, attendance, belts, waivers as PDFs) in one click. No exit fees, no hostage data."],
];

export default function Home() {
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-black"><span className="text-brand">■</span> [ProductName]</Link>
          <nav aria-label="Marketing" className="hidden gap-6 text-sm text-muted md:flex">
            <a href="#switch" className="hover:text-fg">Why switch</a><a href="#martial-arts" className="hover:text-fg">Martial arts</a>
            <a href="#coaches" className="hover:text-fg">Private coaching</a><a href="#pricing" className="hover:text-fg">Pricing</a><a href="#faq" className="hover:text-fg">FAQ</a>
          </nav>
          <div className="flex gap-2"><LinkButton href="/login" variant="ghost">Sign in</LinkButton><LinkButton href="/onboarding">Start free</LinkButton></div>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">For BJJ, Muay Thai, MMA, boxing & kickboxing gyms</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">Run your gym. Not your software bill.</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">Schedule, privates, memberships, belts, fight team, texting and payments in one app, for one monthly price. No add-ons, no marketplace cut, and refunds that actually work.</p>
          <div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/onboarding" className="px-6 text-base">Start free, no sales call</LinkButton><LinkButton href="/login" variant="secondary" className="px-6 text-base">Explore the live demo</LinkButton></div>
          <p className="mt-4 text-sm text-muted">${PRICE}/mo all-in · {FEE} transaction fee, shown on every receipt · free migration · cancel anytime</p>
        </section>

        <section id="switch" className="border-y border-line bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold">Why gyms switch from Mindbody, Zen Planner and Booksy</h2>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead><tr className="border-b border-line"><th className="th" scope="col">&nbsp;</th><th className="th" scope="col">Typical incumbent</th><th className="th text-brand" scope="col">[ProductName]</th></tr></thead>
                <tbody className="divide-y divide-line">{compare.map(([k, a, b]) => <tr key={k}><th scope="row" className="td font-semibold">{k}</th><td className="td text-muted">{a}</td><td className="td font-medium">{b}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted">Comparison reflects common pricing models in the category; check each vendor&apos;s current terms.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold">Everything the big platforms do</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([t, d]) => <div key={t} className="rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-muted">{d}</p></div>)}</div>
        </section>

        <section id="martial-arts" className="border-y border-line bg-surface py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Built for martial arts, not yoga studios</h2>
              <ul className="mt-6 space-y-3 text-muted">
                <li><strong className="text-fg">Belts & stripes per discipline.</strong> BJJ, kids belts, Muay Thai prajioud, or your own system, each with requirements.</li>
                <li><strong className="text-fg">Promotion eligibility from attendance.</strong> &quot;Eligible for a stripe after 25 classes and 2 months&quot; is flagged for you.</li>
                <li><strong className="text-fg">Curriculum library.</strong> Techniques with videos and notes, tied to each rank.</li>
                <li><strong className="text-fg">Belt testing events.</strong> Registration, fees, results, printable certificates.</li>
                <li><strong className="text-fg">Kids programs.</strong> Age groups, parent accounts, pickup notes, guardian contacts.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold">Fight team tools</h3>
              <ul className="mt-4 space-y-3 text-muted">
                <li>Fighter profiles with amateur & pro records (W-L-D, method, round)</li>
                <li>Weight-class tracking, weigh-in logs and cut charts</li>
                <li>Fight camp plans and an event calendar</li>
                <li>Medical, bloodwork & license storage with expiry alerts</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="coaches" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold">Private coaching inside your gym, done right</h2>
          <p className="mt-3 max-w-3xl text-muted">Add coaches as staff or as independent coaches who rent space. Each sells their own privates and packages on your page and their own profile.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">Automatic splits</h3><p className="mt-2 text-sm text-muted">e.g. 70% coach / 30% gym, per coach or per product. Paid out through Stripe Connect. Nobody chases anyone for money.</p></div>
            <div className="rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">Mat rent, collected</h3><p className="mt-2 text-sm text-muted">Flat monthly, per hour or per session. Deducted from the coach&apos;s payout automatically.</p></div>
            <div className="rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">Refunds reverse the split</h3><p className="mt-2 text-sm text-muted">Refund a package and the coach and gym shares reverse proportionally, and unused credits are removed.</p></div>
          </div>
        </section>

        <section id="pricing" className="border-y border-line bg-surface py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-bold">One plan. Everything included.</h2>
            <div className="mt-8 rounded-2xl border-2 border-brand bg-bg p-8">
              <div className="text-5xl font-black">${PRICE}<span className="text-lg font-medium text-muted">/month per location</span></div>
              <p className="mt-2 text-muted">+ {FEE} per card transaction. That&apos;s the only fee, and it&apos;s on every receipt.</p>
              <ul className="mx-auto mt-6 grid max-w-xl gap-2 text-left text-sm sm:grid-cols-2">
                {["Unlimited members & staff", "Unlimited coaches (staff or independent)", "SMS & email, two-way inbox", "Automations & lead pipeline", "Belts, curriculum, testing", "Fight team tools", "Kiosk + member app", "Public API & webhooks", "Free card & data migration", "One-click full export"].map((x) => <li key={x}>✓ {x}</li>)}
              </ul>
              <LinkButton href="/onboarding" className="mt-8 px-8 text-base">Start now, no sales call</LinkButton>
              <p className="mt-4 text-sm text-muted">No marketplace commissions · No &quot;new client&quot; fees · No paid listings · No exit fees</p>
            </div>
            <p className="mt-6 text-sm text-muted">Running 5+ locations? <a className="underline" href="mailto:sales@example.com">Contact us</a> for volume pricing.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold">Our migration promise</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            {["Export from your old system (we show you where)", "Upload CSVs; we map the fields for Mindbody, Zen Planner, Booksy, Gymdesk", "We request your card-on-file transfer to Stripe. Members never re-enter cards", "Packages, balances & belt ranks carry over. Go live."].map((x, i) => <li key={x} className="rounded-xl border border-line bg-surface p-5 text-sm"><span className="text-2xl font-black text-brand">{i + 1}</span><p className="mt-2">{x}</p></li>)}
          </ol>
        </section>

        <section id="faq" className="border-t border-line bg-surface py-16">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-3xl font-bold">FAQ</h2>
            <div className="mt-6 divide-y divide-line">{faq.map(([q, a]) => <details key={q} className="group py-4"><summary className="cursor-pointer list-none font-semibold">{q}</summary><p className="mt-2 text-muted">{a}</p></details>)}</div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line py-8 text-center text-sm text-muted">© [ProductName] · <Link href="/login" className="underline">Demo</Link> · <Link href="/api/v1" className="underline">API</Link></footer>
    </div>
  );
}
