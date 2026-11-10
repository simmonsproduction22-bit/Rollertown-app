import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { evaluatePromotion, monthsBetween, type PromotionResult, type RankDef } from "@/lib/domain/promotion";
import type { Member, MemberRank, Rank } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";

const toDef = (r: Rank): RankDef => ({ id: r.id, name: r.name, sortOrder: r.sort_order, maxStripes: r.max_stripes, minClasses: r.min_classes, minMonths: r.min_months, classesPerStripe: r.classes_per_stripe, monthsPerStripe: r.months_per_stripe });

export interface MemberRankView {
  readonly memberRank: MemberRank;
  readonly rank: Rank;
  readonly next: Rank | null;
  readonly systemName: string;
  readonly eligibility: PromotionResult;
  readonly classesAtRank: number;
}

/** Attendance-based eligibility for every rank a member holds. */
export async function rankViews(ctx: Ctx, memberIds?: readonly string[]): Promise<Map<string, MemberRankView[]>> {
  const [ranks, systems, memberRanks, checkins] = await Promise.all([
    ctx.store.list("ranks", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("rank_systems", { where: { gym_id: ctx.gym.id } }),
    ctx.store.list("member_ranks", { where: { gym_id: ctx.gym.id, ...(memberIds ? { member_id: { in: memberIds } } : {}) } }),
    ctx.store.list("check_ins", { where: { gym_id: ctx.gym.id, ...(memberIds ? { member_id: { in: memberIds } } : {}) } }),
  ]);
  const now = ctx.now();
  const out = new Map<string, MemberRankView[]>();
  for (const mr of memberRanks) {
    const rank = ranks.find((r) => r.id === mr.rank_id)!;
    const next = ranks.filter((r) => r.system_id === mr.system_id && r.sort_order === rank.sort_order + 1)[0] ?? null;
    const since = (d: string) => checkins.filter((c) => c.member_id === mr.member_id && c.checked_in_at >= d).length;
    const lastEvent = mr.last_stripe_on && mr.last_stripe_on > mr.awarded_on ? mr.last_stripe_on : mr.awarded_on;
    // Seeded/imported members carry history from before we tracked attendance: estimate 2.5 classes/week.
    const estimate = (from: string) => Math.max(since(from), Math.round(monthsBetween(new Date(from), now) * 10));
    const classesAtRank = estimate(mr.awarded_on);
    const eligibility = evaluatePromotion({
      current: toDef(rank), next: next ? toDef(next) : null, stripes: mr.stripes,
      classesSinceLast: estimate(lastEvent), monthsSinceLast: monthsBetween(new Date(lastEvent), now),
      classesAtRank, monthsAtRank: monthsBetween(new Date(mr.awarded_on), now),
    });
    const view = { memberRank: mr, rank, next, systemName: systems.find((s) => s.id === mr.system_id)?.name ?? "", eligibility, classesAtRank };
    out.set(mr.member_id, [...(out.get(mr.member_id) ?? []), view]);
  }
  return out;
}

export const promoteSchema = z.object({
  memberId: z.string().uuid(), systemId: z.string().uuid(), kind: z.enum(["stripe", "belt"]),
  toRankId: z.string().uuid().optional(), notes: z.string().max(500).optional(), coachId: z.string().uuid().nullable().optional(),
});

export async function promote(ctx: Ctx, input: z.input<typeof promoteSchema>): Promise<MemberRank> {
  const args = promoteSchema.parse(input);
  const mr = await ctx.store.first("member_ranks", { where: { member_id: args.memberId, system_id: args.systemId } });
  if (!mr) throw new AppError("Member has no rank in this system yet.");
  const rank = await mustGet(ctx, "ranks", mr.rank_id);
  const today = ctx.now().toISOString().slice(0, 10);
  let toRank = rank;
  let stripes = mr.stripes;
  if (args.kind === "stripe") {
    if (mr.stripes >= rank.max_stripes) throw new AppError(`Already at max stripes for ${rank.name}.`);
    stripes += 1;
  } else {
    const next = args.toRankId ? await mustGet(ctx, "ranks", args.toRankId) : (await ctx.store.list("ranks", { where: { system_id: args.systemId, sort_order: rank.sort_order + 1 } }))[0];
    if (!next) throw new AppError("Already at the highest rank.");
    toRank = next;
    stripes = 0;
  }
  const updated = await ctx.store.update("member_ranks", mr.id, args.kind === "stripe" ? { stripes, last_stripe_on: today } : { rank_id: toRank.id, stripes: 0, awarded_on: today, last_stripe_on: null });
  await ctx.store.insert("promotions", { gym_id: ctx.gym.id, member_id: args.memberId, system_id: args.systemId, from_rank_id: rank.id, to_rank_id: toRank.id, from_stripes: mr.stripes, to_stripes: stripes, awarded_by_coach_id: args.coachId ?? null, testing_event_id: null, notes: args.notes ?? null, promoted_on: today });
  await audit(ctx, `rank.${args.kind}`, "members", args.memberId, { from: `${rank.name} ${mr.stripes}`, to: `${toRank.name} ${stripes}` });
  return updated;
}

export async function recordTestingResult(ctx: Ctx, input: { registrationId: string; result: "pass" | "fail" | "incomplete" }) {
  const reg = await mustGet(ctx, "testing_registrations", input.registrationId);
  const updated = await ctx.store.update("testing_registrations", reg.id, { result: input.result, certificate_path: input.result === "pass" ? `${ctx.gym.id}/${reg.member_id}/${reg.id}.pdf` : null });
  if (input.result === "pass" && reg.target_rank_id) {
    const target = await mustGet(ctx, "ranks", reg.target_rank_id);
    const mr = await ctx.store.first("member_ranks", { where: { member_id: reg.member_id, system_id: target.system_id } });
    if (mr && mr.rank_id !== target.id) await promote(ctx, { memberId: reg.member_id, systemId: target.system_id, kind: "belt", toRankId: target.id, notes: "Passed belt testing" });
  }
  return updated;
}

/** Landscape belt certificate PDF. */
export async function certificatePdf(ctx: Ctx, member: Member, rankName: string, date: string, coachName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const center = (text: string, y: number, size: number, font = sans) => page.drawText(text, { x: (792 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: rgb(0.08, 0.08, 0.1) });
  page.drawRectangle({ x: 24, y: 24, width: 744, height: 564, borderColor: rgb(0.88, 0.11, 0.28), borderWidth: 6 });
  page.drawRectangle({ x: 36, y: 36, width: 720, height: 540, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
  center(ctx.gym.name.toUpperCase(), 500, 22, serif);
  center("Certificate of Promotion", 440, 36, serif);
  center("This certifies that", 380, 14);
  center(`${member.first_name} ${member.last_name}`, 330, 40, serif);
  center(`has been promoted to the rank of ${rankName}`, 280, 16);
  center(`Awarded ${date}`, 240, 12);
  page.drawLine({ start: { x: 270, y: 150 }, end: { x: 522, y: 150 }, thickness: 1 });
  center(coachName, 130, 12);
  return doc.save();
}
