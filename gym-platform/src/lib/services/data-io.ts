import { createHash, randomBytes } from "node:crypto";
import JSZip from "jszip";
import Papa from "papaparse";
import { z } from "zod";
import type { ApiKey, ImportJob } from "@/lib/data/types";
import { autoMap, type ImportEntity, type SourceSystem } from "@/lib/import/presets";
import { validateRows } from "@/lib/import/validate";
import { AppError } from "@/lib/result";
import { audit, type Ctx } from "./context";
import { waiverPdf } from "./waivers";
import { TABLE_ORDER } from "@/lib/seed/builder";

// ---------------------------------------------------------------- import
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  return { headers: res.meta.fields ?? [], rows: res.data.slice(0, 20_000) };
}

export function previewImport(text: string, entity: ImportEntity, system: SourceSystem, mapping?: Record<string, string>) {
  const { headers, rows } = parseCsv(text);
  const m = mapping ?? autoMap(headers, entity, system);
  const { ok, errors } = validateRows(entity, rows, m);
  return { headers, mapping: m, total: rows.length, valid: ok.length, errors: errors.slice(0, 50), sample: ok.slice(0, 5) };
}

/** Persists validated rows. Members upsert by email; others attach to members by email. */
export async function runImport(ctx: Ctx, input: { text: string; entity: ImportEntity; system: SourceSystem; mapping: Record<string, string>; fileName?: string }): Promise<ImportJob> {
  const { rows } = parseCsv(input.text);
  const { ok, errors } = validateRows(input.entity, rows, input.mapping);
  const members = await ctx.store.list("members", { where: { gym_id: ctx.gym.id } });
  const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m]));
  const products = await ctx.store.list("products", { where: { gym_id: ctx.gym.id } });
  const rowErrors = [...errors];
  let imported = 0;
  const now = ctx.now().toISOString();
  const productFor = async (name: string, kind: "membership" | "class_pack" | "lesson_pack", price = 0) => {
    const hit = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit;
    const p = await ctx.store.insert("products", { gym_id: ctx.gym.id, kind, name, price_cents: price, interval: kind === "membership" ? "month" : null, is_public: false, is_active: true, created_at: now });
    products.push(p);
    return p;
  };
  for (const [i, raw] of ok.entries()) {
    const r = raw as Record<string, unknown>;
    try {
      if (input.entity === "members") {
        const email = (r.email as string | undefined) ?? null;
        const existing = email ? byEmail.get(email) : undefined;
        const row = { first_name: r.first_name as string, last_name: r.last_name as string, email, phone: (r.phone as string) ?? null, date_of_birth: (r.date_of_birth as string) ?? null, status: ((r.status as string) ?? "active") as "active", joined_on: (r.joined_on as string) ?? now.slice(0, 10), notes: (r.notes as string) ?? null, external_ref: (r.external_ref as string) ?? null };
        if (existing) await ctx.store.update("members", existing.id, row);
        else byEmail.set(email ?? `__${i}`, await ctx.store.insert("members", { gym_id: ctx.gym.id, ...row, created_at: now }));
      } else {
        const m = byEmail.get(String(r.member_email));
        if (!m) throw new Error(`no member with email ${String(r.member_email)}`);
        if (input.entity === "memberships") {
          const p = await productFor(String(r.plan_name), "membership", r.price as number);
          await ctx.store.insert("memberships", { gym_id: ctx.gym.id, member_id: m.id, product_id: p.id, status: ((r.status as string) === "cancelled" ? "cancelled" : "active"), price_cents: r.price as number, discount_bps: 0, started_on: now.slice(0, 10), current_period_end: (r.next_bill_date as string) ?? now.slice(0, 10), cancel_at_period_end: false, cancelled_on: null, stripe_subscription_id: null, failed_payment_count: 0, family_id: null, created_at: now });
        } else if (input.entity === "packages") {
          const isLesson = !!r.coach_name || /private|lesson/i.test(String(r.package_name));
          const p = await productFor(String(r.package_name), isLesson ? "lesson_pack" : "class_pack", (r.amount_paid as number) ?? 0);
          const total = r.credits_total as number;
          await ctx.store.insert("entitlements", { gym_id: ctx.gym.id, member_id: m.id, product_id: p.id, kind: isLesson ? "lesson" : "class", credits_total: Math.max(total, 1), credits_used: total - (r.credits_remaining as number), amount_paid_cents: (r.amount_paid as number) ?? 0, expires_at: r.expires_on ? new Date(r.expires_on as string).toISOString() : null, status: (r.credits_remaining as number) > 0 ? "active" : "exhausted", migrated: true });
        } else {
          await ctx.store.insert("check_ins", { gym_id: ctx.gym.id, member_id: m.id, method: "api", checked_in_at: r.attended_at as string });
        }
      }
      imported++;
    } catch (e) {
      rowErrors.push({ row: i + 2, messages: [e instanceof Error ? e.message : "failed"] });
    }
  }
  const job = await ctx.store.insert("import_jobs", { gym_id: ctx.gym.id, source_system: input.system, entity: input.entity, file_name: input.fileName ?? null, mapping: input.mapping, status: "completed", row_count: rows.length, imported_count: imported, error_count: rowErrors.length, errors: rowErrors.slice(0, 200), created_by: ctx.actor.userId, created_at: now });
  await audit(ctx, "import.completed", "import_jobs", job.id, { entity: input.entity, imported });
  return job;
}

// ---------------------------------------------------------------- export
const SECRET_COLUMNS: Record<string, string[]> = { api_keys: ["key_hash"], webhook_endpoints: ["secret"] };

/** One-click full export: a CSV per table + every signed waiver as a PDF. Free, always. */
export async function exportZip(ctx: Ctx): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const table of TABLE_ORDER) {
    const rows = table === "gyms" ? [ctx.gym] : await ctx.store.list(table, { where: { gym_id: ctx.gym.id } } as never);
    const clean = (rows as unknown as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLUMNS[table]?.includes(k)).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
    zip.file(`csv/${table}.csv`, Papa.unparse(clean.length ? clean : [{}]));
  }
  const sigs = await ctx.store.list("waiver_signatures", { where: { gym_id: ctx.gym.id } });
  for (const s of sigs) {
    const [tpl, m] = await Promise.all([ctx.store.get("waiver_templates", s.template_id), ctx.store.get("members", s.member_id)]);
    if (tpl && m) zip.file(`waivers/${m.last_name}_${m.first_name}_${s.id.slice(0, 8)}_v${s.template_version}.pdf`, await waiverPdf(ctx, tpl, s, m));
  }
  zip.file("README.txt", `Full data export for ${ctx.gym.name}\nGenerated ${ctx.now().toISOString()}\nOne CSV per table (UTF-8, header row). Waivers as signed PDFs. No exit fees, ever.\n`);
  await audit(ctx, "export.downloaded", "gyms", ctx.gym.id, { waivers: sigs.length });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------------------------------------------------------------- API keys
export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Returns the raw key ONCE. Only a SHA-256 hash is stored. */
export async function createApiKey(ctx: Ctx, input: { name: string; scopes: ("read" | "write")[] }): Promise<{ key: ApiKey; raw: string }> {
  const name = z.string().trim().min(2).max(60).parse(input.name);
  const scopes = z.array(z.enum(["read", "write"])).min(1).parse(input.scopes);
  const raw = `gp_live_${randomBytes(24).toString("base64url")}`;
  const key = await ctx.store.insert("api_keys", { gym_id: ctx.gym.id, name, key_prefix: raw.slice(0, 12), key_hash: hashKey(raw), scopes, last_used_at: null, revoked_at: null, created_at: ctx.now().toISOString() });
  await audit(ctx, "api_key.created", "api_keys", key.id, { name, scopes });
  return { key, raw };
}

export async function revokeApiKey(ctx: Ctx, id: string): Promise<void> {
  const key = await ctx.store.get("api_keys", id);
  if (!key || key.gym_id !== ctx.gym.id) throw new AppError("Key not found", 404);
  await ctx.store.update("api_keys", id, { revoked_at: ctx.now().toISOString() });
  await audit(ctx, "api_key.revoked", "api_keys", id);
}

export async function createWebhook(ctx: Ctx, input: { url: string; events: string[] }) {
  const url = z.string().url().startsWith("https://", "Webhook URLs must use https").parse(input.url);
  const events = z.array(z.string()).min(1).parse(input.events);
  return ctx.store.insert("webhook_endpoints", { gym_id: ctx.gym.id, url, events, secret: `whsec_${randomBytes(24).toString("hex")}`, is_active: true, created_at: ctx.now().toISOString() });
}
