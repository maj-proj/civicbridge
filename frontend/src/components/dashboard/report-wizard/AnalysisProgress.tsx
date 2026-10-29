"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * The submission is a single request, so the client cannot observe which
 * server stage is running. These are the stages the request actually performs,
 * in order, advanced on a timer to show that work is in progress — they report
 * activity, never a result. Nothing here claims an outcome: the real findings
 * only appear once the response lands.
 */
const STAGES = [
  "Uploading the photograph",
  "Running object detection",
  "Resolving the address and ward",
  "Checking nearby sensitive zones",
  "Calculating the priority score",
];

const STAGE_MS = 1100;

export function AnalysisProgress() {
  const [reached, setReached] = useState(0);

  useEffect(() => {
    // Hold on the final stage rather than looping or completing — the
    // response decides when this component is replaced.
    if (reached >= STAGES.length - 1) return;

    const timer = setTimeout(() => setReached((n) => n + 1), STAGE_MS);
    return () => clearTimeout(timer);
  }, [reached]);

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
        <span className="absolute inset-2 rounded-full bg-primary/10" />
        <Spinner className="size-7 text-primary" />
      </div>

      <div className="space-y-1 text-center">
        <h2 className="font-heading text-lg font-medium">Analysing your report</h2>
        <p className="text-sm text-muted-foreground">
          This usually takes a few seconds.
        </p>
      </div>

      <ul className="w-full max-w-sm space-y-2.5" aria-live="polite">
        {STAGES.map((stage, index) => {
          const complete = index < reached;
          const active = index === reached;

          return (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-2.5 text-sm transition-colors",
                complete && "text-muted-foreground",
                active && "text-foreground",
                !complete && !active && "text-muted-foreground/50"
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {complete ? (
                  <Check className="size-3.5 text-primary" />
                ) : active ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              {stage}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
