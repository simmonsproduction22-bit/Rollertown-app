import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { signOut } from "@/app/actions/staff";

const TABS = [["/m", "Home"], ["/m/book", "Classes"], ["/m/privates", "Privates"], ["/m/pay", "Pay"]] as const;

/** Member PWA shell: phone-first, bottom tab bar with large tap targets. */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession("member.self");
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-24">
      <header className="flex items-center justify-between px-4 py-4"><span className="font-black"><span className="text-brand">■</span> Demo MMA</span><form action={signOut}><button className="text-xs text-muted underline">{s.name} · sign out</button></form></header>
      <main id="main" className="px-4">{children}</main>
      <nav aria-label="Member" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <ul className="mx-auto grid max-w-lg grid-cols-4">{TABS.map(([href, label]) => <li key={href}><Link href={href} className="flex min-h-16 items-center justify-center text-sm font-semibold text-muted hover:text-fg">{label}</Link></li>)}</ul>
      </nav>
    </div>
  );
}
