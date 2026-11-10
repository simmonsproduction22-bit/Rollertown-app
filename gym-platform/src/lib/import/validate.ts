import { z } from "zod";
import { canonicalFields, type ImportEntity } from "./presets";

const money = z.string().transform((v, ctx) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a valid amount" });
    return z.NEVER;
  }
  return Math.round(n * 100);
});
const date = z.string().transform((v, ctx) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a valid date" });
    return z.NEVER;
  }
  return d.toISOString().slice(0, 10);
});
const int = z.string().transform((v, ctx) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a whole number" });
    return z.NEVER;
  }
  return n;
});
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal("").transform(() => undefined), s]).optional();
const email = z.string().trim().toLowerCase().email();
const statusMap = (v: string) => {
  const s = v.toLowerCase();
  if (/(inactive|cancel|terminat|expired)/.test(s)) return "cancelled";
  if (/(frozen|hold|suspend)/.test(s)) return "frozen";
  if (/(lead|prospect)/.test(s)) return "lead";
  if (/trial/.test(s)) return "trial";
  return "active";
};

export const rowSchemas = {
  members: z.object({
    external_ref: opt(z.string()),
    first_name: z.string().trim().min(1, "first name is required"),
    last_name: z.string().trim().min(1, "last name is required"),
    email: opt(email),
    phone: opt(z.string().transform((v) => v.replace(/[^\d+]/g, ""))),
    date_of_birth: opt(date),
    status: opt(z.string().transform(statusMap)),
    joined_on: opt(date),
    notes: opt(z.string()),
  }),
  memberships: z.object({
    member_email: email,
    plan_name: z.string().min(1),
    price: money,
    interval: opt(z.string().transform((v) => (/year|annual/i.test(v) ? "year" : /week/i.test(v) ? "week" : "month"))),
    next_bill_date: opt(date),
    status: opt(z.string().transform(statusMap)),
  }),
  packages: z.object({
    member_email: email,
    package_name: z.string().min(1),
    credits_total: int,
    credits_remaining: int,
    amount_paid: opt(money),
    expires_on: opt(date),
    coach_name: opt(z.string()),
  }).refine((r) => r.credits_remaining <= r.credits_total, { message: "remaining exceeds total" }),
  attendance: z.object({
    member_email: email,
    class_name: opt(z.string()),
    attended_at: z.string().transform((v, ctx) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a valid date/time" });
        return z.NEVER;
      }
      return d.toISOString();
    }),
  }),
} as const;

export interface RowError {
  readonly row: number;
  readonly messages: readonly string[];
}

export function applyMapping(raw: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([key, header]) => [key, (raw[header] ?? "").trim()]));
}

export function validateRows<E extends ImportEntity>(entity: E, rows: readonly Record<string, string>[], mapping: Record<string, string>) {
  const missing = canonicalFields[entity].filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (missing.length) return { ok: [] as z.infer<(typeof rowSchemas)[E]>[], errors: [{ row: 0, messages: [`Map required fields: ${missing.join(", ")}`] }] };
  const ok: z.infer<(typeof rowSchemas)[E]>[] = [];
  const errors: RowError[] = [];
  rows.forEach((raw, i) => {
    const parsed = rowSchemas[entity].safeParse(applyMapping(raw, mapping));
    if (parsed.success) ok.push(parsed.data as z.infer<(typeof rowSchemas)[E]>);
    else errors.push({ row: i + 2, messages: parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`) });
  });
  return { ok, errors };
}
