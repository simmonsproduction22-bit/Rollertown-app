import { applyBps, assertBps, assertCents } from "./money";

export type SplitParty = "platform" | "gym" | "coach";

export interface SplitLine {
  readonly party: SplitParty;
  readonly coachId: string | null;
  readonly amountCents: number;
}

export interface SplitInput {
  readonly totalCents: number;
  /** Transparent platform fee (default 300 = 3%). */
  readonly platformFeeBps: number;
  /** Set when the sale belongs to a coach (their private or package). */
  readonly coachId?: string | null;
  /** Coach's share of the net (after platform fee). */
  readonly coachSplitBps?: number;
  /** Per-session mat rent the gym takes out of the coach's share. */
  readonly perSessionRentCents?: number;
}

/**
 * How the money from one checkout is divided.
 *  1. platform fee = total × fee bps
 *  2. net = total − fee
 *  3. coach share = net × coach bps − per-session rent (never below 0)
 *  4. gym share = everything else
 * Lines always sum exactly to totalCents.
 */
export function computeSplits(input: SplitInput): SplitLine[] {
  assertCents(input.totalCents, "totalCents");
  assertBps(input.platformFeeBps, "platformFeeBps");
  const fee = applyBps(input.totalCents, input.platformFeeBps);
  const net = input.totalCents - fee;
  const platform: SplitLine = { party: "platform", coachId: null, amountCents: fee };

  if (!input.coachId) {
    return [platform, { party: "gym", coachId: null, amountCents: net }];
  }

  const coachBps = input.coachSplitBps ?? 7000;
  assertBps(coachBps, "coachSplitBps");
  const rent = input.perSessionRentCents ?? 0;
  assertCents(rent, "perSessionRentCents");
  const grossCoach = applyBps(net, coachBps);
  const coach = Math.max(0, grossCoach - rent);
  return [
    platform,
    { party: "coach", coachId: input.coachId, amountCents: coach },
    { party: "gym", coachId: null, amountCents: net - coach },
  ];
}

export function sumSplits(lines: readonly { amountCents: number }[]): number {
  return lines.reduce((acc, l) => acc + l.amountCents, 0);
}
