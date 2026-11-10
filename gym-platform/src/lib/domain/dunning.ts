/** Failed-payment retry schedule. retryDays = days after the FIRST failure. */
export function nextRetryAt(firstFailedAt: Date, attemptCount: number, retryDays: readonly number[]): Date | null {
  const idx = attemptCount - 1; // attempt 1 failed → use retryDays[0]
  if (idx < 0 || idx >= retryDays.length) return null;
  return new Date(firstFailedAt.getTime() + retryDays[idx] * 86_400_000);
}

export function dunningMessage(args: { firstName: string; gymName: string; amount: string; updateUrl: string; finalNotice: boolean }): string {
  const lead = args.finalNotice ? "Final notice: " : "";
  return `${lead}Hi ${args.firstName}, your ${args.gymName} payment of ${args.amount} didn't go through. Update your card here: ${args.updateUrl}`;
}
