import { formatCents } from "@/lib/domain/money";

export const money = (c: number) => formatCents(c);
export const dateFmt = (iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(typeof iso === "string" ? new Date(iso) : iso);
export const timeFmt = (iso: string | Date, tz: string) => dateFmt(iso, tz, { hour: "numeric", minute: "2-digit" });
export const dayTimeFmt = (iso: string | Date, tz: string) => dateFmt(iso, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
export const fullName = (m: { first_name: string; last_name: string | null } | undefined | null) => (m ? `${m.first_name} ${m.last_name ?? ""}`.trim() : "Unknown");
export const ago = (iso: string | null, now = new Date()) => {
  if (!iso) return "never";
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
