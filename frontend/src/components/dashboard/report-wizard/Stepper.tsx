import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: number;
  label: string;
  hint: string;
}

/**
 * Horizontal progress across the report flow. Purely presentational — the
 * wizard owns which step is current, and steps are never clickable, because
 * every transition depends on work the previous step produced.
 */
export function Stepper({
  steps,
  current,
}: {
  steps: Step[];
  current: number;
}) {
  return (
    <ol className="flex w-full items-start gap-2">
      {steps.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        const last = index === steps.length - 1;

        return (
          <li key={step.id} className="flex flex-1 items-start gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    !done && !active && "border-border text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : step.id}
                </span>

                {!last && (
                  <span
                    aria-hidden
                    className={cn(
                      "h-px flex-1 transition-colors",
                      done ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>

              <div className="pr-2">
                <div
                  className={cn(
                    "text-sm transition-colors",
                    active ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </div>
                <div className="hidden text-xs text-muted-foreground sm:block">
                  {step.hint}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
