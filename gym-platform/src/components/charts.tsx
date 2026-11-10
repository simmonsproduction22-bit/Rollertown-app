/** Minimal accessible bar chart (no chart library). Values in cents or counts. */
export function Bars({ data, format, label }: { data: { label: string; value: number; secondary?: number }[]; format: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className="flex h-40 items-end gap-2" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted">{format(d.value)}</span>
            <div className="relative w-full rounded-t bg-brand/80" style={{ height: `${Math.max(2, (d.value / max) * 120)}px` }}>
              {d.secondary ? <div className="absolute bottom-0 w-full rounded-t bg-ok/80" style={{ height: `${(d.secondary / Math.max(d.value, 1)) * 100}%` }} /> : null}
            </div>
            <span className="text-xs text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

export const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
