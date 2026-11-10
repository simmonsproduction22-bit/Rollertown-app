import { applyBps, assertBps, assertCents } from "./money";

export interface PriceQuote {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly platformFeeCents: number;
  readonly lines: readonly { label: string; amountCents: number }[];
}

/**
 * Checkout quote. Sibling discount applies to the 2nd+ family member on a
 * family-eligible plan. The platform fee is shown, never hidden: by default
 * the business absorbs it (included in total), optionally passed to the buyer.
 */
export function quote(args: {
  unitPriceCents: number;
  quantity?: number;
  siblingIndex?: number; // 0 = first family member
  siblingDiscountBps?: number;
  platformFeeBps: number;
  feePaidBy?: "business" | "customer";
}): PriceQuote {
  const qty = args.quantity ?? 1;
  assertCents(args.unitPriceCents, "unitPriceCents");
  assertBps(args.platformFeeBps, "platformFeeBps");
  const subtotal = args.unitPriceCents * qty;
  const sibBps = (args.siblingIndex ?? 0) > 0 ? args.siblingDiscountBps ?? 0 : 0;
  assertBps(sibBps, "siblingDiscountBps");
  const discount = applyBps(subtotal, sibBps);
  const afterDiscount = subtotal - discount;
  const customerPays = args.feePaidBy === "customer";
  const fee = applyBps(afterDiscount, args.platformFeeBps);
  const total = customerPays ? afterDiscount + fee : afterDiscount;
  const lines = [
    { label: qty > 1 ? `Subtotal (${qty} × )` : "Subtotal", amountCents: subtotal },
    ...(discount > 0 ? [{ label: "Sibling discount", amountCents: -discount }] : []),
    ...(customerPays ? [{ label: "Transaction fee", amountCents: fee }] : []),
  ];
  return { subtotalCents: subtotal, discountCents: discount, totalCents: total, platformFeeCents: fee, lines };
}
