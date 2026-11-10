import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiCtx, handle, json, page } from "@/lib/api-auth";
import { ok } from "@/lib/result";
import { bookClass } from "@/lib/services/bookings";
import { checkIn } from "@/lib/services/checkin";
import { createLead } from "@/lib/services/comms";

/** Public REST API v1. See /app/developers for docs. */
type Params = { params: Promise<{ path: string[] }> };
const PII_SAFE = (m: Record<string, unknown>) => { const { medical_notes: _m, notes: _n, stripe_customer_id: _s, ...rest } = m; return rest; };

export async function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const ctx = await apiCtx(req, "read");
    if (ctx instanceof NextResponse) return ctx;
    const [resource, id] = (await params).path;
    const q = req.nextUrl.searchParams;
    const g = { gym_id: ctx.gym.id };
    const pg = page(req);
    switch (resource) {
      case "members": {
        if (id) { const m = await ctx.store.get("members", id); return m && m.gym_id === ctx.gym.id ? json(ok(PII_SAFE(m as never))) : json({ success: false, error: "Not found" }, 404); }
        const rows = await ctx.store.list("members", { where: { ...g, ...(q.get("status") ? { status: q.get("status") as never } : {}) }, order: { column: "last_name" } });
        return pg.slice(rows.map((r) => PII_SAFE(r as never)));
      }
      case "classes": return pg.slice(await ctx.store.list("class_sessions", { where: { ...g, starts_at: { gte: q.get("from") ?? new Date().toISOString() } }, order: { column: "starts_at" } }));
      case "bookings": return pg.slice(await ctx.store.list("class_bookings", { where: { ...g, ...(q.get("session_id") ? { session_id: q.get("session_id")! } : {}) } }));
      case "payments": return pg.slice(await ctx.store.list("transactions", { where: g, order: { column: "created_at", ascending: false } }));
      case "checkins": return pg.slice(await ctx.store.list("check_ins", { where: { ...g, checked_in_at: { gte: q.get("since") ?? "1970-01-01" } }, order: { column: "checked_in_at", ascending: false } }));
      case "leads": return pg.slice(await ctx.store.list("leads", { where: g, order: { column: "created_at", ascending: false } }));
      default: return json({ success: false, error: "Unknown resource" }, 404);
    }
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const ctx = await apiCtx(req, "write");
    if (ctx instanceof NextResponse) return ctx;
    const [resource] = (await params).path;
    const body = await req.json().catch(() => ({}));
    switch (resource) {
      case "bookings": {
        const b = z.object({ session_id: z.string().uuid(), member_id: z.string().uuid() }).parse(body);
        return json(ok(await bookClass(ctx, { sessionId: b.session_id, memberId: b.member_id, source: "api" })), 201);
      }
      case "checkins": {
        const b = z.object({ member_id: z.string().uuid() }).parse(body);
        return json(ok((await checkIn(ctx, { memberId: b.member_id, method: "api" })).checkIn), 201);
      }
      case "leads": {
        const b = z.object({ first_name: z.string(), last_name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), interest: z.string().optional() }).parse(body);
        return json(ok(await createLead(ctx, { firstName: b.first_name, lastName: b.last_name, email: b.email, phone: b.phone, interest: b.interest, source: "api" })), 201);
      }
      default: return json({ success: false, error: "Unknown resource" }, 404);
    }
  });
}
