"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GYM_COOKIE } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/roles";
import { serviceStore } from "@/lib/data";
import { isDemoMode } from "@/lib/env";
import { AppError, fail } from "@/lib/result";
import { acceptInvite } from "@/lib/services/onboarding";

/** Grants the invited role to the signed-in user. The service store is used only after the token and email are checked. */
export async function acceptInviteAction(f: FormData) {
  const token = String(f.get("token") ?? "");
  let target: string;
  try {
    if (isDemoMode()) throw new AppError("Invites need Supabase. In demo mode, pick a role on the sign-in page.", 400, "DEMO");
    const { supabaseForUser } = await import("@/lib/supabase/server");
    const { data } = await (await supabaseForUser()).auth.getUser();
    if (!data.user?.email) throw new AppError("Please sign in first.", 401, "UNAUTHENTICATED");
    const r = await acceptInvite(await serviceStore(), { rawToken: token, userId: data.user.id, email: data.user.email, now: new Date() });
    (await cookies()).set(GYM_COOKIE, r.gymId, { httpOnly: true, sameSite: "lax", path: "/" });
    target = homeFor(r.role);
  } catch (e) {
    target = `/invite/${encodeURIComponent(token)}?err=${encodeURIComponent(fail(e).error ?? "Could not accept invite")}`;
  }
  redirect(target);
}
