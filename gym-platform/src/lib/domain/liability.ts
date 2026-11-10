export interface PackageLike {
  readonly creditsTotal: number;
  readonly creditsUsed: number;
  readonly amountPaidCents: number;
  readonly refundedCents?: number;
  readonly status: string;
}

/** Earned = paid × used/total. Unearned (liability) = remainder. */
export function packageLiability(p: PackageLike): { earnedCents: number; unearnedCents: number } {
  const paid = p.amountPaidCents - (p.refundedCents ?? 0);
  if (p.status !== "active" || p.creditsTotal === 0) return { earnedCents: Math.max(0, paid), unearnedCents: 0 };
  const earned = Math.floor((p.amountPaidCents * p.creditsUsed) / p.creditsTotal);
  return { earnedCents: Math.min(earned, paid), unearnedCents: Math.max(0, paid - earned) };
}

export function totalLiability(packages: readonly PackageLike[]): { earnedCents: number; unearnedCents: number; count: number } {
  return packages.reduce(
    (acc, p) => {
      const l = packageLiability(p);
      return {
        earnedCents: acc.earnedCents + l.earnedCents,
        unearnedCents: acc.unearnedCents + l.unearnedCents,
        count: acc.count + (p.status === "active" ? 1 : 0),
      };
    },
    { earnedCents: 0, unearnedCents: 0, count: 0 },
  );
}
