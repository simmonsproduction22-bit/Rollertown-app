import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:brightness-110",
  secondary: "border border-line bg-raised text-fg hover:border-muted",
  ghost: "text-fg hover:bg-raised",
  danger: "bg-bad text-white hover:brightness-110",
};
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btn, variants[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />;
}
export function Card({ className, title, action, children }: { className?: string; title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold tabular-nums", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
const tones = { neutral: "bg-raised text-fg", ok: "bg-ok/15 text-ok", warn: "bg-warn/15 text-warn", bad: "bg-bad/15 text-bad", brand: "bg-brand/15 text-brand" };
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Field({ label, name, hint, ...p }: ComponentProps<"input"> & { label: string; name: string; hint?: string }) {
  return <label className="block"><span className="label">{label}</span><input name={name} className="input" {...p} />{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>;
}
export function Select({ label, name, children, ...p }: ComponentProps<"select"> & { label: string; name: string }) {
  return <label className="block"><span className="label">{label}</span><select name={name} className="input" {...p}>{children}</select></label>;
}
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] border-collapse">
        <thead className="border-b border-line"><tr>{head.map((h) => <th key={h} className="th" scope="col">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="p-4 text-sm text-muted">{empty}</p>}
    </div>
  );
}
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <div role="status" className={cx("mb-4 rounded-lg border px-4 py-3 text-sm font-medium", err ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok")}>{err ?? msg}</div>;
}
export function Bar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "ok" | "warn" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="h-2 w-full rounded-full bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={cx("h-2 rounded-full", tone === "brand" ? "bg-brand" : tone === "ok" ? "bg-ok" : "bg-warn")} style={{ width: `${pct}%` }} /></div>;
}
export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={cx("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", t.key === active ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg")}>{t.label}</Link>)}
    </nav>
  );
}
export function Belt({ color, stripes = 0, name }: { color: string; stripes?: number; name: string }) {
  return (
    <span className="inline-flex items-center gap-2" title={`${name}${stripes ? `, ${stripes} stripe${stripes > 1 ? "s" : ""}` : ""}`}>
      <span className="relative inline-block h-3 w-14 rounded-sm border border-line" style={{ background: color }}>
        <span className="absolute right-1 top-0 flex h-full gap-0.5">{Array.from({ length: stripes }, (_, i) => <span key={i} className="h-full w-1 bg-white" />)}</span>
      </span>
      <span className="text-sm">{name}{stripes ? ` · ${stripes}` : ""}</span>
    </span>
  );
}
export { cx };
