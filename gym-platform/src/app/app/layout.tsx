import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS, type Capability } from "@/lib/auth/roles";
import { signOut } from "@/app/actions/staff";
import { isDemoMode } from "@/lib/env";

const NAV: { href: string; label: string; cap: Capability }[] = [
  { href: "/app", label: "Dashboard", cap: "dashboard.view" },
  { href: "/app/coach", label: "My coaching", cap: "coach.self" },
  { href: "/app/schedule", label: "Schedule", cap: "bookings.manage" },
  { href: "/app/members", label: "Members", cap: "members.view" },
  { href: "/app/coaches", label: "Coaches", cap: "reports.view" },
  { href: "/app/payments", label: "Payments", cap: "payments.view" },
  { href: "/app/reports", label: "Reports", cap: "reports.view" },
  { href: "/app/messages", label: "Messages & leads", cap: "messages.view" },
  { href: "/app/ranks", label: "Belts & curriculum", cap: "ranks.promote" },
  { href: "/app/fight-team", label: "Fight team", cap: "fightteam.view" },
  { href: "/app/pos", label: "Point of sale", cap: "pos.sell" },
  { href: "/app/import", label: "Import & migration", cap: "import.run" },
  { href: "/app/settings", label: "Settings", cap: "settings.manage" },
  { href: "/app/developers", label: "API & export", cap: "export.run" },
  { href: "/kiosk", label: "Kiosk mode ↗", cap: "checkin.kiosk" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const items = NAV.filter((n) => can(s.role, n.cap));
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/app" className="text-lg font-black tracking-tight"><span className="text-brand">■</span> [ProductName]</Link>
          {isDemoMode() && <Link href="/login" className="rounded bg-warn/15 px-2 py-0.5 text-xs font-bold text-warn">DEMO</Link>}
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible">
          {items.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-raised hover:text-fg">{n.label}</Link>)}
        </nav>
        <div className="hidden border-t border-line p-4 lg:block">
          <div className="text-sm font-semibold">{s.name}</div>
          <div className="text-xs text-muted">{ROLE_LABELS[s.role]}</div>
          <form action={signOut}><button className="mt-2 text-xs text-muted underline hover:text-fg">Switch user / sign out</button></form>
        </div>
      </aside>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
