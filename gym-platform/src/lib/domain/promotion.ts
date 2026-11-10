export interface RankDef {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly maxStripes: number;
  readonly minClasses: number;
  readonly minMonths: number;
  readonly classesPerStripe: number | null;
  readonly monthsPerStripe: number | null;
}

export interface PromotionInput {
  readonly current: RankDef;
  readonly next: RankDef | null;
  readonly stripes: number;
  /** Since the last stripe or belt. */
  readonly classesSinceLast: number;
  readonly monthsSinceLast: number;
  /** Since the current belt was awarded. */
  readonly classesAtRank: number;
  readonly monthsAtRank: number;
}

export interface PromotionResult {
  readonly eligible: boolean;
  readonly kind: "stripe" | "belt" | "none";
  readonly nextRankName: string | null;
  readonly classesNeeded: number;
  readonly monthsNeeded: number;
  /** 0..1 combined progress (min of class and time progress). */
  readonly progress: number;
}

function gap(required: number, have: number): number {
  return Math.max(0, required - have);
}

/**
 * "Eligible for a stripe after X classes and Y months." Stripes come first;
 * once max stripes are reached, the next belt's requirements apply. Coaches
 * always make the final call: this only flags eligibility.
 */
export function evaluatePromotion(input: PromotionInput): PromotionResult {
  const { current, next, stripes } = input;
  const stripeKind = stripes < current.maxStripes && current.classesPerStripe != null;

  if (stripeKind) {
    const needC = current.classesPerStripe ?? 0;
    const needM = current.monthsPerStripe ?? 0;
    return build("stripe", current.name, needC, needM, input.classesSinceLast, input.monthsSinceLast);
  }
  if (!next) {
    return { eligible: false, kind: "none", nextRankName: null, classesNeeded: 0, monthsNeeded: 0, progress: 1 };
  }
  return build("belt", next.name, next.minClasses, next.minMonths, input.classesAtRank, input.monthsAtRank);
}

function build(kind: "stripe" | "belt", name: string, needC: number, needM: number, haveC: number, haveM: number): PromotionResult {
  const classesNeeded = gap(needC, haveC);
  const monthsNeeded = Math.round(gap(needM, haveM) * 10) / 10;
  const pc = needC === 0 ? 1 : Math.min(1, haveC / needC);
  const pm = needM === 0 ? 1 : Math.min(1, haveM / needM);
  return {
    eligible: classesNeeded === 0 && monthsNeeded === 0,
    kind,
    nextRankName: name,
    classesNeeded,
    monthsNeeded,
    progress: Math.min(pc, pm),
  };
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}
