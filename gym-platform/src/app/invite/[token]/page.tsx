import Link from "next/link";
import { Card, Flash } from "@/components/ui";
import { one, type SP } from "@/lib/ctx";
import { serviceStore } from "@/lib/data";
import { isDemoMode } from "@/lib/env";
import { findInvite } from "@/lib/services/onboarding";
import { MagicLinkForm } from "@/app/login/magic-link";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invite", robots: { index: false } };

const REASON = { not_found: "This invite link isn't valid.", expired: "This invite has expired. Ask the gym to send a new one.", used: "This invite was already used or cancelled." } as const;

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const sp = await searchParams;
  const shell = (body: React.ReactNode) => (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <Link href="/" className="text-lg font-black"><span className="text-brand">■</span> [ProductName]</Link>
      <h1 className="mt-6 text-2xl font-bold">Accept your invite</h1>
      <div className="mt-4"><Flash err={one(sp.err)} /></div>
      <Card className="mt-2">{body}</Card>
    </main>
  );
  if (isDemoMode()) return shell(<p className="text-sm text-muted">Invites work once Supabase is connected. In demo mode, <Link href="/login" className="underline">pick a role</Link> to look around.</p>);

  const found = await findInvite(await serviceStore(), token, new Date());
  if (!found.ok) return shell(<p>{REASON[found.reason]}</p>);
  const { invite, gymName } = found;
  const role = invite.role.replace(/_/g, " ");

  const { supabaseForUser } = await import("@/lib/supabase/server");
  const { data } = await (await supabaseForUser()).auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? null;

  if (!email) return shell(<>
    <p><strong>{gymName}</strong> invited <strong>{invite.email}</strong> to join as {role}.</p>
    <p className="mt-2 text-sm text-muted">Sign in with that email to accept. We&apos;ll send a one-time link and bring you back here.</p>
    <div className="mt-4"><MagicLinkForm next={`/invite/${token}`} defaultEmail={invite.email} /></div>
  </>);

  if (email !== invite.email.toLowerCase()) return shell(<>
    <p>This invite is for <strong>{invite.email}</strong>, but you&apos;re signed in as <strong>{email}</strong>.</p>
    <p className="mt-2 text-sm text-muted">Sign out and sign back in with the invited email, or ask {gymName} to invite this address instead.</p>
  </>);

  return shell(<form action={acceptInviteAction} className="space-y-4">
    <p><strong>{gymName}</strong> invited you to join as {role}.</p>
    {invite.role === "independent_coach" && <p className="text-sm text-muted">As an independent coach you sell your own privates and packages. Your revenue split is shown on every sale and in your coach dashboard.</p>}
    <input type="hidden" name="token" value={token} />
    <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 font-semibold text-brand-fg">Join {gymName}</button>
  </form>);
}
