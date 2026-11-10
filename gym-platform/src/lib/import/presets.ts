/**
 * Field-mapping presets for common export formats. Keys are our canonical
 * fields; values are candidate source headers (case/space-insensitive).
 * Gyms can override any mapping in the wizard.
 */
export type SourceSystem = "mindbody" | "zen_planner" | "booksy" | "gymdesk" | "generic";
export type ImportEntity = "members" | "memberships" | "packages" | "attendance";

export const canonicalFields: Record<ImportEntity, readonly { key: string; label: string; required: boolean }[]> = {
  members: [
    { key: "external_ref", label: "Source ID", required: false },
    { key: "first_name", label: "First name", required: true },
    { key: "last_name", label: "Last name", required: true },
    { key: "email", label: "Email", required: false },
    { key: "phone", label: "Phone", required: false },
    { key: "date_of_birth", label: "Birthday", required: false },
    { key: "status", label: "Status", required: false },
    { key: "joined_on", label: "Join date", required: false },
    { key: "notes", label: "Notes", required: false },
  ],
  memberships: [
    { key: "member_email", label: "Member email", required: true },
    { key: "plan_name", label: "Plan name", required: true },
    { key: "price", label: "Price", required: true },
    { key: "interval", label: "Billing interval", required: false },
    { key: "next_bill_date", label: "Next bill date", required: false },
    { key: "status", label: "Status", required: false },
  ],
  packages: [
    { key: "member_email", label: "Member email", required: true },
    { key: "package_name", label: "Package name", required: true },
    { key: "credits_total", label: "Total sessions", required: true },
    { key: "credits_remaining", label: "Remaining sessions", required: true },
    { key: "amount_paid", label: "Amount paid", required: false },
    { key: "expires_on", label: "Expiration", required: false },
    { key: "coach_name", label: "Coach", required: false },
  ],
  attendance: [
    { key: "member_email", label: "Member email", required: true },
    { key: "class_name", label: "Class name", required: false },
    { key: "attended_at", label: "Date/time", required: true },
  ],
};

const common: Record<string, string[]> = {
  external_ref: ["id", "client id", "clientid", "member id", "customer id"],
  first_name: ["first name", "firstname", "first", "given name"],
  last_name: ["last name", "lastname", "last", "surname", "family name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile", "mobile phone", "cell phone", "phone number", "cell"],
  date_of_birth: ["birthday", "birth date", "date of birth", "dob", "birthdate"],
  status: ["status", "member status", "account status"],
  joined_on: ["join date", "first visit", "created", "member since", "creation date", "date added"],
  notes: ["notes", "comments"],
  member_email: ["email", "client email", "member email", "customer email"],
  plan_name: ["membership", "plan", "plan name", "contract", "membership name"],
  price: ["price", "amount", "rate", "recurring amount"],
  interval: ["interval", "frequency", "billing frequency", "billing cycle"],
  next_bill_date: ["next bill date", "next payment", "next billing date", "renewal date"],
  package_name: ["package", "pricing option", "series", "service", "package name"],
  credits_total: ["total", "count", "total sessions", "sessions", "visits"],
  credits_remaining: ["remaining", "remaining sessions", "visits remaining", "sessions left"],
  amount_paid: ["amount paid", "paid", "price paid", "total paid"],
  expires_on: ["expiration", "expiration date", "expires", "exp date"],
  coach_name: ["staff", "coach", "instructor", "teacher", "trainer"],
  class_name: ["class", "class name", "service", "event"],
  attended_at: ["date", "visit date", "class date", "check in", "checked in", "attended"],
};

/** System-specific header names, checked before the common list. */
export const presets: Record<SourceSystem, Record<string, string[]>> = {
  mindbody: {
    external_ref: ["client id", "id"],
    package_name: ["pricing option"],
    credits_remaining: ["remaining"],
    joined_on: ["creation date", "first visit"],
  },
  zen_planner: {
    external_ref: ["person id"],
    plan_name: ["membership template", "membership"],
    next_bill_date: ["next bill date"],
    attended_at: ["attendance date", "date"],
  },
  booksy: {
    external_ref: ["customer id"],
    first_name: ["customer first name", "first name"],
    last_name: ["customer last name", "last name"],
    package_name: ["service name", "package"],
    coach_name: ["staffer", "staff"],
  },
  gymdesk: {
    external_ref: ["member id"],
    plan_name: ["membership plan", "plan"],
    status: ["member status", "status"],
  },
  generic: {},
};

const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Best-guess mapping {canonicalKey: sourceHeader}. */
export function autoMap(headers: readonly string[], entity: ImportEntity, system: SourceSystem): Record<string, string> {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const mapping: Record<string, string> = {};
  for (const f of canonicalFields[entity]) {
    const candidates = [...(presets[system][f.key] ?? []), ...(common[f.key] ?? [])];
    const hit = candidates.map(norm).find((c) => byNorm.has(c));
    if (hit) mapping[f.key] = byNorm.get(hit)!;
  }
  return mapping;
}
