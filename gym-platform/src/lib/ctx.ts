import "server-only";
import { redirect } from "next/navigation";
import { requireSession, authorize, type Session } from "@/lib/auth/session";
import type { Capability } from "@/lib/auth/roles";
import { serviceStore } from "@/lib/data";
import type { Store } from "@/lib/data/store";
import { payments } from "@/lib/payments/stripe";
import { loadGym, type Ctx } from "@/lib/services/context";
import { DEMO_GYM_ID } from "@/lib/seed/constants";
import { fail } from "@/lib/result";
import { isDemoMode } from "@/lib/env";

export async function ctxFor(s: Session): Promise<Ctx> {
  return { store: s.store, gym: await loadGym(s.store, s.gymId), actor: { userId: s.userId, label: s.name, role: s.role }, payments: payments(), now: () => new Date() };
}

/** For pages. */
export async function pageCtx(cap?: Capability): Promise<{ s: Session; ctx: Ctx }> {
  const s = await requireSession(cap);
  return { s, ctx: await ctxFor(s) };
}

/** For public pages / webhooks / API keys: service store, explicit gym. */
export async function publicCtx(gymSlugOrId: string, store?: Store): Promise<Ctx> {
  const st = store ?? (await serviceStore());
  const bySlug = await st.first("gyms", { where: { slug: gymSlugOrId } });
  const gym = bySlug ?? (await st.get("gyms", gymSlugOrId)) ?? (isDemoMode() ? await st.get("gyms", DEMO_GYM_ID) : null);
  if (!gym) redirect("/");
  return { store: st, gym: await loadGym(st, gym.id), actor: { userId: null, label: "public", role: "public" }, payments: payments(), now: () => new Date() };
}

/**
 * Wraps a server action: authorize → run → redirect back with a flash.
 * redirect() must be called outside try/catch (it throws by design).
 */
export async function runAction(cap: Capability, back: string, fn: (ctx: Ctx, s: Session) => Promise<string | void>): Promise<never> {
  let target: string;
  try {
    const s = await authorize(cap);
    const msg = await fn(await ctxFor(s), s);
    target = withParam(back, "msg", msg ?? "Saved.");
  } catch (e) {
    target = withParam(back, "err", fail(e).error ?? "Something went wrong");
  }
  redirect(target);
}

export function withParam(url: string, key: string, value: string): string {
  const [path, q = ""] = url.split("?");
  const p = new URLSearchParams(q);
  p.delete("msg");
  p.delete("err");
  p.set(key, value);
  return `${path}?${p.toString()}`;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
