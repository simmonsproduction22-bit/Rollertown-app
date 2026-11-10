import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { ctxFor } from "@/lib/ctx";
import { waiverPdf } from "@/lib/services/waivers";

/** Signed waiver PDF. Staff, or the member/guardian it belongs to. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ success: false, error: "Sign in" }, { status: 401 });
  const ctx = await ctxFor(s);
  const sig = await ctx.store.get("waiver_signatures", (await params).id);
  if (!sig || sig.gym_id !== ctx.gym.id) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const guards = s.memberId ? await ctx.store.first("guardians", { where: { child_member_id: sig.member_id, guardian_member_id: s.memberId } }) : null;
  if (!can(s.role, "members.view") && sig.member_id !== s.memberId && !guards) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const [tpl, member] = await Promise.all([ctx.store.get("waiver_templates", sig.template_id), ctx.store.get("members", sig.member_id)]);
  const pdf = await waiverPdf(ctx, tpl!, sig, member!);
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="waiver-${sig.id.slice(0, 8)}.pdf"` } });
}
