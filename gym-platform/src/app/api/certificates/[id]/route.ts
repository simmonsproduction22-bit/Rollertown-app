import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/session";
import { ctxFor } from "@/lib/ctx";
import { certificatePdf } from "@/lib/services/ranks";
import { fail } from "@/lib/result";

/** Belt certificate PDF for a passed testing registration. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await ctxFor(await authorize("ranks.promote"));
    const reg = await ctx.store.get("testing_registrations", (await params).id);
    if (!reg || reg.gym_id !== ctx.gym.id || reg.result !== "pass") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const [member, rank, event] = await Promise.all([ctx.store.get("members", reg.member_id), reg.target_rank_id ? ctx.store.get("ranks", reg.target_rank_id) : null, ctx.store.get("testing_events", reg.event_id)]);
    const coach = (await ctx.store.list("coaches", { where: { gym_id: ctx.gym.id } }))[0];
    const pdf = await certificatePdf(ctx, member!, rank?.name ?? "next rank", (event?.starts_at ?? new Date().toISOString()).slice(0, 10), coach?.display_name ?? ctx.gym.name);
    return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="certificate-${reg.id.slice(0, 8)}.pdf"` } });
  } catch (e) {
    return NextResponse.json(fail(e), { status: 403 });
  }
}
