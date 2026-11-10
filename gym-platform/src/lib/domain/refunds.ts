import { allocate, assertCents } from "./money";
import type { SplitParty } from "./splits";

export interface ExistingSplit {
  readonly id: string;
  readonly party: SplitParty;
  readonly coachId: string | null;
  readonly amountCents: number;
  readonly reversedCents: number;
}

export interface ReversalLine {
  readonly splitId: string;
  readonly party: SplitParty;
  readonly coachId: string | null;
  readonly reverseCents: number;
}

/**
 * Refunds pull money back from every party in proportion to what they were
 * originally paid (coach, gym and the platform fee alike). Partial and
 * repeated refunds never reverse more than a split has left.
 */
export function computeRefundReversal(args: {
  splits: readonly ExistingSplit[];
  totalCents: number;
  refundedCents: number;
  refundCents: number;
}): ReversalLine[] {
  const { splits, totalCents, refundedCents, refundCents } = args;
  assertCents(refundCents, "refundCents");
  if (refundCents === 0) throw new Error("Refund amount must be greater than zero");
  const refundable = totalCents - refundedCents;
  if (refundCents > refundable) {
    throw new Error(`Refund of ${refundCents} exceeds refundable balance of ${refundable}`);
  }
  const remaining = splits.map((s) => s.amountCents - s.reversedCents);
  const parts = allocate(refundCents, remaining, remaining);
  return splits.map((s, i) => ({ splitId: s.id, party: s.party, coachId: s.coachId, reverseCents: parts[i] }));
}
