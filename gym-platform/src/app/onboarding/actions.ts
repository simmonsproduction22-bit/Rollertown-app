"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env, isDemoMode } from "@/lib/env";
import { authorize, GYM_COOKIE } from "@/lib/auth/session";
import { userStore } from "@/lib/data";
import { ctxFor } from "@/lib/ctx";
import { payments } from "@/lib/payments/stripe";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { isRankTemplateKey } from "@/lib/domain/rank-templates";
import { applyRankTemplates, createFirstClasses, inviteStaff } from "@/lib/services/onboarding";
import { fail } from "@/lib/result";

const gymSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, "Use 3–60 lowercase letters, numbers or dashes"),
  timezone: z.string().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  email: z.string().email().optional().or(z.literal("")),
});

const classRow = z.object({ name: z.string().trim().max(80), weekday: z.coerce.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/) });
const coachRow = z.object({ email: z.string().trim().email(), kind: z.enum(["staff_coach", "independent_coach"]) });

/** Wizard step handler. Live mode writes each step; the gym creator becomes owner via DB trigger. */
export async function onboardingAction(f: FormData) {
  const step = String(f.get("step"));
  const next = String(f.get("next"));
  let target = next === "done" ? (isDemoMode() ? "/login" : "/app") : `/onboarding?step=${next}`;
  try {
    if (!isDemoMode()) {
      if (step === "gym") {
        const store = await userStore();
        const g = gymSchema.parse(Object.fromEntries(f.entries()));
        const gym = await store.insert("gyms", { name: g.name, slug: g.slug, timezone: g.timezone, email: g.email || null, settings: DEFAULT_SETTINGS, platform_fee_bps: env.platformFeeBps, onboarding_step: next });
        (await cookies()).set(GYM_COOKIE, gym.id, { httpOnly: true, sameSite: "lax", path: "/" });
        await store.insert("locations", { gym_id: gym.id, name: "Main", is_primary: true });
      } else {
        const s = await authorize("settings.manage");
        const ctx = await ctxFor(s);
        let msg: string | null = null;
        if (step === "disciplines") {
          const have = new Set((await ctx.store.list("disciplines", { where: { gym_id: s.gymId } })).map((d) => d.slug));
          const rows = f.getAll("discipline").map(String).slice(0, 12).map((n) => ({ gym_id: s.gymId, name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, "-") })).filter((d) => !have.has(d.slug));
          if (rows.length) await ctx.store.insertMany("disciplines", rows);
        } else if (step === "ranks") {
          const created = await applyRankTemplates(ctx, f.getAll("rank_system").map(String).filter(isRankTemplateKey));
          msg = created.length ? `Added ${created.length} belt system${created.length === 1 ? "" : "s"}.` : null;
        } else if (step === "schedule") {
          const names = f.getAll("class_name"), days = f.getAll("class_day"), times = f.getAll("class_time");
          const rows = names.map((n, i) => classRow.parse({ name: n, weekday: days[i], startTime: times[i] })).filter((r) => r.name.length > 0);
          const series = await createFirstClasses(ctx, rows);
          msg = series.length ? `Added ${series.length} weekly class${series.length === 1 ? "" : "es"}.` : null;
        } else if (step === "stripe") {
          const link = await payments().onboardingLink({ accountId: ctx.gym.stripe_account_id ?? null, email: ctx.gym.email ?? null, returnUrl: `${env.appUrl}/onboarding?step=import`, refreshUrl: `${env.appUrl}/onboarding?step=stripe` });
          await ctx.store.update("gyms", s.gymId, { stripe_account_id: link.accountId, onboarding_step: next });
          target = link.url;
        } else if (step === "coaches") {
          const emails = f.getAll("coach_email").map(String), kinds = f.getAll("coach_type").map(String);
          const rows = emails.map((e, i) => ({ email: e.trim(), kind: kinds[i] === "independent" ? "independent_coach" : "staff_coach" })).filter((r) => r.email).map((r) => coachRow.parse(r));
          for (const r of rows) await inviteStaff(ctx, r);
          msg = rows.length ? `Sent ${rows.length} invite${rows.length === 1 ? "" : "s"}.` : null;
        }
        if (step !== "stripe") {
          await ctx.store.update("gyms", s.gymId, { onboarding_step: next });
          if (msg && next !== "done") target += `&msg=${encodeURIComponent(msg)}`;
        }
      }
    }
  } catch (e) {
    target = `/onboarding?step=${step}&err=${encodeURIComponent(fail(e).error ?? "Failed")}`;
  }
  redirect(target);
}
