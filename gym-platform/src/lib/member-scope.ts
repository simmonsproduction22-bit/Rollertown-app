import "server-only";
import type { Session } from "@/lib/auth/session";
import type { Ctx } from "@/lib/services/context";
import type { Member } from "@/lib/data/types";

/** The member themself + any children they guard (for the profile switcher). */
export async function familyScope(ctx: Ctx, s: Session, requested?: string): Promise<{ me: Member | null; people: Member[]; active: Member | null }> {
  const me = s.memberId ? await ctx.store.get("members", s.memberId) : null;
  const kids = s.memberId ? await ctx.store.list("guardians", { where: { guardian_member_id: s.memberId } }) : [];
  const children = kids.length ? await ctx.store.list("members", { where: { id: { in: kids.map((k) => k.child_member_id) } } }) : [];
  const people = [...(me ? [me] : []), ...children];
  return { me, people, active: people.find((p) => p.id === requested) ?? people[0] ?? null };
}
