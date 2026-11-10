/**
 * Starter rank systems a gym can pick during onboarding. Every number here is
 * an editable default (Belt systems page), not a rule of the sport.
 */
export type RankTemplateKey = "bjj" | "bjj_kids" | "muay_thai";

export interface RankTemplateRank {
  readonly name: string;
  readonly color: string;
  readonly maxStripes: number;
  readonly minClasses: number;
  readonly minMonths: number;
  readonly classesPerStripe: number | null;
  readonly monthsPerStripe: number | null;
}

export interface RankTemplate {
  readonly key: RankTemplateKey;
  readonly name: string;
  readonly usesStripes: boolean;
  /** Discipline slugs this system belongs to, in order of preference. */
  readonly disciplineSlugs: readonly string[];
  readonly ranks: readonly RankTemplateRank[];
}

const r = (name: string, color: string, p: Partial<RankTemplateRank> = {}): RankTemplateRank => ({
  name, color, maxStripes: 4, minClasses: 0, minMonths: 0, classesPerStripe: null, monthsPerStripe: null, ...p,
});

export const RANK_TEMPLATES: Readonly<Record<RankTemplateKey, RankTemplate>> = {
  bjj: {
    key: "bjj", name: "BJJ Adult", usesStripes: true, disciplineSlugs: ["brazilian-jiu-jitsu", "no-gi"],
    ranks: [
      r("White", "#f8fafc", { classesPerStripe: 25, monthsPerStripe: 2 }),
      r("Blue", "#2563eb", { minClasses: 150, minMonths: 18, classesPerStripe: 40, monthsPerStripe: 4 }),
      r("Purple", "#7c3aed", { minClasses: 300, minMonths: 24, classesPerStripe: 50, monthsPerStripe: 5 }),
      r("Brown", "#78350f", { minClasses: 400, minMonths: 18, classesPerStripe: 60, monthsPerStripe: 4 }),
      r("Black", "#0a0a0a", { minClasses: 500, minMonths: 12, maxStripes: 6 }),
    ],
  },
  bjj_kids: {
    key: "bjj_kids", name: "BJJ Kids", usesStripes: true, disciplineSlugs: ["kids-martial-arts", "brazilian-jiu-jitsu"],
    ranks: [
      r("White", "#f8fafc", { classesPerStripe: 12, monthsPerStripe: 1 }),
      r("Grey", "#a1a1aa", { minClasses: 50, minMonths: 6, classesPerStripe: 12, monthsPerStripe: 1 }),
      r("Yellow", "#facc15", { minClasses: 60, minMonths: 8, classesPerStripe: 15, monthsPerStripe: 2 }),
      r("Orange", "#fb923c", { minClasses: 70, minMonths: 8, classesPerStripe: 15, monthsPerStripe: 2 }),
      r("Green", "#16a34a", { minClasses: 80, minMonths: 10, classesPerStripe: 18, monthsPerStripe: 2 }),
    ],
  },
  muay_thai: {
    key: "muay_thai", name: "Muay Thai Prajioud", usesStripes: false, disciplineSlugs: ["muay-thai", "kickboxing"],
    ranks: ["White", "Yellow", "Orange", "Green", "Blue", "Brown", "Red", "Black"].map((n, i) =>
      r(`${n} Prajioud`, ["#f8fafc", "#facc15", "#fb923c", "#16a34a", "#2563eb", "#78350f", "#dc2626", "#0a0a0a"][i], {
        maxStripes: 0, minClasses: i === 0 ? 0 : 30 + i * 20, minMonths: i === 0 ? 0 : 2 + i * 2,
      })),
  },
};

export const isRankTemplateKey = (v: string): v is RankTemplateKey => v in RANK_TEMPLATES;
