"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { statusLabel } from "@/lib/reportStatus";

/**
 * The only interactive piece of the report detail view, so it is the only
 * part that ships as a client component.
 */
export function StatusAdvanceButton({
  reportId,
  nextStatus,
}: {
  reportId: string;
  nextStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          note: `Marked ${statusLabel(nextStatus)} from the dashboard.`,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update the status.");
        return;
      }

      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the status."
      );
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || isPending;

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={advance}
        disabled={busy}
        className="w-full"
      >
        {busy && <Spinner />}
        Mark as {statusLabel(nextStatus)}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
