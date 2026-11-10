import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { serviceStore } from "@/lib/data";
import { payments } from "@/lib/payments/stripe";
import { loadGym, type Ctx } from "@/lib/services/context";
import { hashKey } from "@/lib/services/data-io";
import { fail, ok, type ApiResponse } from "@/lib/result";

const hits = new Map<string, number[]>();

/** Authenticates `Authorization: Bearer gp_live_…`, enforces scope + 120 req/min. */
export async function apiCtx(req: NextRequest, scope: "read" | "write"): Promise<Ctx | NextResponse> {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!raw.startsWith("gp_live_")) return json({ success: false, error: "Missing or invalid API key" }, 401);
  const store = await serviceStore();
  const key = await store.first("api_keys", { where: { key_hash: hashKey(raw) } });
  if (!key || key.revoked_at) return json({ success: false, error: "Invalid API key" }, 401);
  if (!key.scopes.includes(scope)) return json({ success: false, error: `Key lacks '${scope}' scope` }, 403);
  const now = Date.now();
  const recent = (hits.get(key.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 120) return json({ success: false, error: "Rate limit exceeded" }, 429);
  hits.set(key.id, [...recent, now]);
  await store.update("api_keys", key.id, { last_used_at: new Date().toISOString() });
  return { store, gym: await loadGym(store, key.gym_id), actor: { userId: null, label: `api:${key.name}`, role: "api" }, payments: payments(), now: () => new Date() };
}

export function json<T>(body: ApiResponse<T>, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function page(req: NextRequest) {
  const p = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
  return { p, limit, slice: <T,>(rows: T[]) => json(ok(rows.slice((p - 1) * limit, p * limit), { total: rows.length, page: p, limit })) };
}

export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return json(fail(e), status);
  }
}
