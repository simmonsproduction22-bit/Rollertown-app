"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env, isDemoMode } from "@/lib/env";
import { getSession, GYM_COOKIE } from "@/lib/auth/session";
import { userStore } from "@/lib/data";
import { payments } from "@/lib/payments/stripe";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { fail } from "@/lib/result";

const gymSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, "Use 3–60 lowercase letters, numbers or dashes"),
  timezone: z.string().min(3).max(60),
  email: z.string().email().optional().or(z.literal("")),
});

/** Wizard step handler. Live mode creates the gym (creator becomes owner via DB trigger). */
export async function onboardingAction(f: FormData) {
  const step = String(f.get("step"));
  const next = String(f.get("next"));
  let target = next === "done" ? (isDemoMode() ? "/login" : "/app") : `/onboarding?step=${next}`;
  try {
    if (!isDemoMode()) {
      const s = await getSession();
      const store = await userStore();
      if (step === "gym") {
        const g = gymSchema.parse(Object.fromEntries(f.entries()));
        const gym = await store.insert("gyms", { name: g.name, slug: g.slug, timezone: g.timezone, email: g.email || null, settings: DEFAULT_SETTINGS, platform_fee_bps: env.platformFeeBps });
        (await cookies()).set(GYM_COOKIE, gym.id, { httpOnly: true, sameSite: "lax", path: "/" });
        await store.insert("locations", { gym_id: gym.id, name: "Main", is_primary: true });
      } else if (s && step === "disciplines") {
        const names = f.getAll("discipline").map(String).slice(0, 12);
        await store.insertMany("disciplines", names.map((n) => ({ gym_id: s.gymId, name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, "-") })));
      } else if (s && step === "stripe") {
        const gym = await store.get("gyms", s.gymId);
        const link = await payments().onboardingLink({ accountId: gym?.stripe_account_id ?? null, email: gym?.email ?? null, returnUrl: `${env.appUrl}/onboarding?step=import`, refreshUrl: `${env.appUrl}/onboarding?step=stripe` });
        await store.update("gyms", s.gymId, { stripe_account_id: link.accountId });
        target = link.url;
      }
    }
  } catch (e) {
    target = `/onboarding?step=${step}&err=${encodeURIComponent(fail(e).error ?? "Failed")}`;
  }
  redirect(target);
}
