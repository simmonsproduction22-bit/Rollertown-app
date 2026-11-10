/** Money helpers. All amounts are integer cents; percentages are basis points. */

export const BPS = 10_000;

export function assertCents(value: number, label = "amount"): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents`);
  }
}

export function assertBps(value: number, label = "bps"): void {
  if (!Number.isInteger(value) || value < 0 || value > BPS) {
    throw new Error(`${label} must be an integer between 0 and ${BPS}`);
  }
}

/** Round-half-up share of an amount in basis points. */
export function applyBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / BPS);
}

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2)}%`;
}

/**
 * Distribute `total` across `weights` so the parts sum exactly to `total`
 * (largest-remainder method). Optional `caps` bound each part.
 */
export function allocate(total: number, weights: readonly number[], caps?: readonly number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map((r, i) => Math.min(Math.floor(r), caps?.[i] ?? Infinity));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  // Hand out leftover cents by largest fraction; capped parts are skipped and
  // their excess flows to parts with room left.
  while (remainder > 0) {
    const room = order.filter(({ i }) => result[i] < (caps?.[i] ?? Infinity));
    if (room.length === 0) break;
    for (const { i } of room) {
      if (remainder <= 0) break;
      const give = Math.min(remainder, Math.max(1, Math.floor(remainder / room.length)), (caps?.[i] ?? Infinity) - result[i]);
      result[i] += give;
      remainder -= give;
    }
  }
  return result;
}
