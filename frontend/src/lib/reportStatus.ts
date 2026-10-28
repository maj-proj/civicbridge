/** Presentation helpers for ReportStatus, shared by the list and detail views. */

const NEUTRAL = "border-border bg-muted text-muted-foreground";

export const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: NEUTRAL,
  ANALYZING: NEUTRAL,
  VERIFIED: "border-sky-200 bg-sky-50 text-sky-700",
  ROUTED: "border-violet-200 bg-violet-50 text-violet-700",
  ACKNOWLEDGED: "border-cyan-200 bg-cyan-50 text-cyan-700",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
};

export const STATUS_SEQUENCE = [
  "SUBMITTED",
  "VERIFIED",
  "ROUTED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
] as const;

/** Turns an enum member such as POLLUTION_CONTROL into "Pollution Control". */
export function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? NEUTRAL;
}

/** CivicReport.type is a free-form string column, so unknown values still render. */
export function reportTypeLabel(type: string): string {
  return statusLabel(type);
}
