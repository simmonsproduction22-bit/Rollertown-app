export const dynamic = "force-dynamic";
import Link from "next/link";
import { switchDemoRole } from "@/app/actions/staff";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { DEMO_USERS } from "@/lib/seed/constants";
import { isDemoMode } from "@/lib/env";
import { Button, Card } from "@/components/ui";
import { MagicLinkForm } from "./magic-link";

export const metadata = { title: "Sign in" };

const BLURB: Record<keyof typeof DEMO_USERS, string> = {
  owner: "Everything: revenue, payouts, refunds, settings, export.",
  manager: "Runs the gym day to day. Reports, refunds, policies.",
  front_desk: "Check-ins, bookings, sales, members.",
  head_coach: "Rafael: BJJ head coach, belts, fight team, privates.",
  coach: "Nina: Muay Thai coach on staff.",
  independent_coach: "Marcus: rents ring time, sells his own boxing privates.",
  member: "Alex: adult member using the phone app.",
  guardian: "Priya: parent managing two kids' accounts.",
};

export default function LoginPage() {
  const demo = isDemoMode();
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-lg font-black"><span className="text-brand">■</span> [ProductName]</Link>
      <h1 className="mt-6 text-3xl font-bold">Sign in</h1>
      {demo ? (
        <>
          <p className="mt-2 text-muted">Demo mode: no keys configured, so you&apos;re exploring <strong className="text-fg">Demo MMA Academy</strong> with seeded data. Pick a role:</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(Object.keys(DEMO_USERS) as (keyof typeof DEMO_USERS)[]).map((role) => (
              <form key={role} action={switchDemoRole}>
                <input type="hidden" name="role" value={role} />
                <button className="w-full rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand focus-visible:border-brand">
                  <div className="font-semibold">{ROLE_LABELS[role]} <span className="font-normal text-muted">· {DEMO_USERS[role].name}</span></div>
                  <div className="mt-1 text-sm text-muted">{BLURB[role]}</div>
                </button>
              </form>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">Also try the public pages: <Link className="underline" href="/g/demo-mma">gym booking page</Link> · <Link className="underline" href="/g/demo-mma/coach/marcus-bell">coach page</Link>.</p>
        </>
      ) : (
        <Card className="mt-6"><MagicLinkForm /><p className="mt-3 text-xs text-muted">No password. We email you a one-time sign-in link.</p></Card>
      )}
      {!demo && <p className="mt-4 text-sm text-muted">New gym? <Link href="/onboarding" className="underline">Start free setup</Link>.</p>}
      <noscript><Button>JavaScript is required for magic-link sign-in.</Button></noscript>
    </main>
  );
}
