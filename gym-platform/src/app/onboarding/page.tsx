import Link from "next/link";
import { one, type SP } from "@/lib/ctx";
import { Card, Field, Flash } from "@/components/ui";
import { isDemoMode } from "@/lib/env";
import { onboardingAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your gym" };

const STEPS = [
  ["gym", "Gym info"], ["disciplines", "Disciplines"], ["ranks", "Belt systems"], ["schedule", "First classes"],
  ["stripe", "Connect Stripe"], ["import", "Import data"], ["coaches", "Invite coaches"],
] as const;

export default async function Onboarding({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const step = one(sp.step) ?? "gym";
  const idx = Math.max(0, STEPS.findIndex(([k]) => k === step));
  const next = STEPS[idx + 1]?.[0];
  const Hidden = () => <><input type="hidden" name="step" value={step} /><input type="hidden" name="next" value={next ?? "done"} /></>;
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="font-black"><span className="text-brand">■</span> [ProductName]</Link>
      <h1 className="mt-6 text-3xl font-bold">Set up your gym</h1>
      <p className="mt-1 text-muted">About 15 minutes. No sales call. Everything is included from day one.</p>
      {isDemoMode() && <p className="mt-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">Demo mode: steps are walk-through only. Add Supabase keys to create a real gym.</p>}
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Progress">{STEPS.map(([k, l], i) => <li key={k}><Link href={`/onboarding?step=${k}`} aria-current={k === step ? "step" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${i < idx ? "bg-ok/15 text-ok" : k === step ? "bg-brand text-brand-fg" : "bg-raised text-muted"}`}>{i + 1}. {l}</Link></li>)}</ol>
      <div className="mt-6"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <Card className="mt-2" title={STEPS[idx][1]}>
        <form action={onboardingAction} className="space-y-4">
          <Hidden />
          {step === "gym" && <><Field label="Gym name" name="name" required placeholder="Iron Lotus BJJ" /><Field label="Web address" name="slug" required pattern="[a-z0-9-]{3,60}" placeholder="iron-lotus" hint="Your booking page: /g/iron-lotus" /><Field label="Timezone" name="timezone" defaultValue="America/New_York" /><Field label="Email" name="email" type="email" /></>}
          {step === "disciplines" && <fieldset className="grid grid-cols-2 gap-2">{["Brazilian Jiu-Jitsu", "No-Gi", "Muay Thai", "MMA", "Boxing", "Kickboxing", "Wrestling", "Kids Martial Arts", "Judo", "Karate"].map((d) => <label key={d} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3"><input type="checkbox" name="discipline" value={d} defaultChecked={["Brazilian Jiu-Jitsu", "Muay Thai"].includes(d)} />{d}</label>)}</fieldset>}
          {step === "ranks" && <fieldset className="space-y-2">{[["bjj", "BJJ adult (White → Black, 4 stripes)"], ["bjj_kids", "BJJ kids (White, Grey, Yellow, Orange, Green)"], ["muay_thai", "Muay Thai prajioud (8 levels)"], ["custom", "Custom: I'll set it up later"]].map(([v, l]) => <label key={v} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="rank_system" value={v} defaultChecked={v !== "custom"} />{l}</label>)}<p className="text-xs text-muted">Each comes with editable class-count and time requirements per stripe and belt.</p></fieldset>}
          {step === "schedule" && <><p className="text-sm text-muted">Add a few recurring classes now; you can build the full timetable later.</p>{[0, 1, 2].map((i) => <div key={i} className="grid grid-cols-3 gap-2"><input name="class_name" placeholder={["Fundamentals", "Muay Thai", "Kids BJJ"][i]} className="input" aria-label="Class name" /><select name="class_day" className="input" aria-label="Day">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, j) => <option key={d} value={(j + 1) % 7}>{d}</option>)}</select><input type="time" name="class_time" defaultValue="18:00" className="input" aria-label="Start time" /></div>)}</>}
          {step === "stripe" && <><p className="text-sm text-muted">Payments go through Stripe Connect. You get paid out directly; coaches get their split automatically. Our only fee is the transparent 3% transaction fee.</p><input type="hidden" name="connect" value="1" /></>}
          {step === "import" && <p className="text-sm text-muted">Coming from Mindbody, Zen Planner, Booksy or Gymdesk? After setup, open <strong>Import &amp; migration</strong> to upload your CSV exports (we map the fields) and request your free card-on-file transfer. Members never re-enter cards.</p>}
          {step === "coaches" && <><p className="text-sm text-muted">Invite coaches as staff or as independent coaches who sell their own privates (with automatic revenue splits and optional mat rent).</p>{[0, 1].map((i) => <div key={i} className="grid grid-cols-3 gap-2"><input name="coach_email" type="email" placeholder="coach@email.com" className="input col-span-2" aria-label="Coach email" /><select name="coach_type" className="input" aria-label="Coach type"><option value="staff">Staff</option><option value="independent">Independent</option></select></div>)}</>}
          <div className="flex justify-between">{idx > 0 ? <Link href={`/onboarding?step=${STEPS[idx - 1][0]}`} className="min-h-11 rounded-lg border border-line px-4 py-2.5 text-sm">Back</Link> : <span />}<button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-brand-fg">{step === "stripe" ? "Connect with Stripe" : next ? "Continue" : "Finish"}</button></div>
        </form>
      </Card>
    </main>
  );
}
