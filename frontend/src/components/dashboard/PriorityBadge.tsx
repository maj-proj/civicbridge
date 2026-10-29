import { AlertTriangle, ArrowUp, Flame, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PriorityLabel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

/**
 * The four bands are the one place the UI steps outside the neutral palette.
 * Keeping the ramp here means a band never renders two different colours in
 * two different views.
 */
const BANDS: Record<
  PriorityLabel,
  { text: string; chip: string; panel: string; icon: React.ElementType }
> = {
  LOW: {
    text: "Low",
    chip: "border-border bg-muted text-muted-foreground",
    panel: "border-border bg-muted/60 text-foreground",
    icon: Minus,
  },
  MEDIUM: {
    text: "Medium",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    panel: "border-amber-200 bg-amber-50 text-amber-900",
    icon: ArrowUp,
  },
  HIGH: {
    text: "High",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
    panel: "border-orange-200 bg-orange-50 text-orange-900",
    icon: AlertTriangle,
  },
  VERY_HIGH: {
    text: "Very High",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    panel: "border-rose-200 bg-rose-50 text-rose-900",
    icon: Flame,
  },
};

export const PRIORITY_ORDER: PriorityLabel[] = [
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LOW",
];

export function priorityText(label: PriorityLabel): string {
  return (BANDS[label] ?? BANDS.LOW).text;
}

export function PriorityBadge({
  label,
  score,
  className,
}: {
  label: PriorityLabel;
  score?: number | null;
  className?: string;
}) {
  const band = BANDS[label] ?? BANDS.LOW;
  const Icon = band.icon;

  return (
    <Badge variant="outline" className={cn(band.chip, className)}>
      <Icon />
      {band.text}
      {typeof score === "number" && (
        <span className="tabular-nums opacity-70">{score}</span>
      )}
    </Badge>
  );
}

/** The headline treatment, used once per page on report detail and results. */
export function PriorityScore({
  label,
  score,
  className,
}: {
  label: PriorityLabel;
  score?: number | null;
  className?: string;
}) {
  const band = BANDS[label] ?? BANDS.LOW;
  const Icon = band.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-4 rounded-xl border px-4 py-3",
        band.panel,
        className
      )}
    >
      <Icon className="size-5" />
      <div>
        <div className="text-xs text-muted-foreground">Priority</div>
        <div className="text-base font-semibold">{band.text}</div>
      </div>
      {typeof score === "number" && (
        <div className="border-l border-current/15 pl-4">
          <div className="text-xs text-muted-foreground">Score</div>
          <div className="text-base font-semibold tabular-nums">{score}</div>
        </div>
      )}
    </div>
  );
}
