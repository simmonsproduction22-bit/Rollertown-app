import { describe, expect, it } from "vitest";
import { evaluatePromotion } from "@/lib/domain/promotion";

const white = { id: "w", name: "White", sortOrder: 1, maxStripes: 4, minClasses: 0, minMonths: 0, classesPerStripe: 20, monthsPerStripe: 2 };
const blue = { id: "b", name: "Blue", sortOrder: 2, maxStripes: 4, minClasses: 120, minMonths: 18, classesPerStripe: 40, monthsPerStripe: 4 };

describe("evaluatePromotion", () => {
  it("eligible for a stripe after enough classes and time", () => {
    const r = evaluatePromotion({ current: white, next: blue, stripes: 1, classesSinceLast: 22, monthsSinceLast: 2.5, classesAtRank: 45, monthsAtRank: 5 });
    expect(r).toMatchObject({ eligible: true, kind: "stripe" });
  });
  it("not eligible and reports what's missing", () => {
    const r = evaluatePromotion({ current: white, next: blue, stripes: 1, classesSinceLast: 10, monthsSinceLast: 1, classesAtRank: 30, monthsAtRank: 3 });
    expect(r.eligible).toBe(false);
    expect(r.classesNeeded).toBe(10);
    expect(r.monthsNeeded).toBeCloseTo(1);
    expect(r.progress).toBeGreaterThan(0);
    expect(r.progress).toBeLessThan(1);
  });
  it("at max stripes, checks next belt requirements", () => {
    const r = evaluatePromotion({ current: white, next: blue, stripes: 4, classesSinceLast: 5, monthsSinceLast: 1, classesAtRank: 130, monthsAtRank: 19 });
    expect(r).toMatchObject({ eligible: true, kind: "belt", nextRankName: "Blue" });
  });
  it("top rank with max stripes is never eligible", () => {
    const r = evaluatePromotion({ current: blue, next: null, stripes: 4, classesSinceLast: 999, monthsSinceLast: 99, classesAtRank: 999, monthsAtRank: 99 });
    expect(r.eligible).toBe(false);
    expect(r.kind).toBe("none");
  });
});
