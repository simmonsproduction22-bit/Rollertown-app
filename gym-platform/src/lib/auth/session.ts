import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { userStore } from "@/lib/data";
import type { Store } from "@/lib/data/store";
import type { Role } from "@/lib/data/types";
import { DEMO_GYM_ID, DEMO_USERS } from "@/lib/seed/constants";
import { can, type Capability } from "./roles";
import { AppError } from "@/lib/result";

export const DEMO_ROLE_COOKIE = "gp_demo_role";
export const GYM_COOKIE = "gp_gym";

export interface Session {
  readonly mode: "demo" | "live";
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly gymId: string;
  readonly role: Role;
  readonly roles: readonly Role[];
  readonly coachId: string | null;
  readonly memberId: string | null;
  readonly store: Store;
}

const ROLE_ORDER: Role[] = ["owner", "manager", "front_desk", "head_coach", "coach", "independent_coach", "guardian", "member"];

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const store = await userStore();
  if (isDemoMode()) {
    const role = (jar.get(DEMO_ROLE_COOKIE)?.value as Role | undefined) ?? null;
    if (!role || !(role in DEMO_USERS)) return null;
    const user = DEMO_USERS[role as keyof typeof DEMO_USERS];
    const rows = await store.list("gym_users", { where: { user_id: user.id, gym_id: DEMO_GYM_ID } });
    const row = rows.find((r) => r.role === role) ?? rows[0];
    return { mode: "demo", userId: user.id, name: user.name, email: user.email, gymId: DEMO_GYM_ID, role, roles: rows.map((r) => r.role), coachId: row?.coach_id ?? null, memberId: rows.find((r) => r.member_id)?.member_id ?? null, store };
  }
  const { supabaseForUser } = await import("@/lib/supabase/server");
  const sb = await supabaseForUser();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const rows = await store.list("gym_users", { where: { user_id: data.user.id } });
  if (rows.length === 0) return null;
  const preferredGym = jar.get(GYM_COOKIE)?.value;
  const gymId = rows.some((r) => r.gym_id === preferredGym) ? preferredGym! : rows[0].gym_id;
  const inGym = rows.filter((r) => r.gym_id === gymId).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const top = inGym[0];
  return {
    mode: "live", userId: data.user.id, name: (data.user.user_metadata?.full_name as string) ?? data.user.email ?? "User",
    email: data.user.email ?? "", gymId, role: top.role, roles: inGym.map((r) => r.role),
    coachId: inGym.find((r) => r.coach_id)?.coach_id ?? null, memberId: inGym.find((r) => r.member_id)?.member_id ?? null, store,
  };
}

/** For pages: redirects to sign-in when missing, 403 page when not allowed. */
export async function requireSession(cap?: Capability): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (cap && !can(s.role, cap)) redirect("/forbidden");
  return s;
}

/** For server actions: throws instead of redirecting. */
export async function authorize(cap: Capability): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AppError("Please sign in.", 401, "UNAUTHENTICATED");
  if (!can(s.role, cap)) throw new AppError("You don't have permission to do that.", 403, "FORBIDDEN");
  return s;
}
