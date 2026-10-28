/**
 * The two analysis read-outs that appear both on the submission result and on
 * the saved report detail page. Keeping them here stops the two views from
 * explaining the same score in two different shapes.
 */

export interface CategoryRow {
  category: string;
  object_count: number;
  percentage: number;
}

export interface BreakdownFactor {
  key: string;
  label: string;
  value: number;
  detail: string;
}

export function CompositionBars({ rows }: { rows: CategoryRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.category} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{row.category}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.object_count} · {row.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(Math.max(row.percentage, 0), 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoreFactors({ factors }: { factors: BreakdownFactor[] }) {
  if (factors.length === 0) return null;

  return (
    <ul className="divide-y divide-border">
      {factors.map((factor) => (
        <li
          key={factor.key}
          className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{factor.label}</div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {factor.detail}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
            {factor.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
