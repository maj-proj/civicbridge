"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Code2,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { EmailDraft } from "./types";

export function NoticePreparing() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <Spinner className="size-6 text-primary" />
        <div className="space-y-1 text-center">
          <h2 className="font-heading text-lg font-medium">Drafting the notice</h2>
          <p className="text-sm text-muted-foreground">
            Resolving the responsible authority and preparing the message.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function NoticeStep({
  draft,
  sending,
  error,
  onBack,
  onRedraft,
  onSend,
}: {
  draft: EmailDraft;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onRedraft: () => void;
  onSend: () => void;
}) {
  const [approved, setApproved] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const blocked = Boolean(draft.blocker);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Review the notice</CardTitle>
          <CardDescription>
            Nothing has been sent. Read the message below and approve it before
            it goes to the authority.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[7rem_1fr]">
            <dt className="text-muted-foreground">Authority</dt>
            <dd>
              <div className="font-medium">{draft.authorityName}</div>
              {draft.authorityDesignation && (
                <div className="text-muted-foreground">
                  {draft.authorityDesignation}
                </div>
              )}
            </dd>

            <dt className="text-muted-foreground">To</dt>
            <dd className="font-mono text-xs break-all">{draft.intendedTo}</dd>

            {draft.ccEmails.length > 0 && (
              <>
                <dt className="text-muted-foreground">CC</dt>
                <dd className="font-mono text-xs break-all">
                  {draft.ccEmails.join(", ")}
                </dd>
              </>
            )}

            <dt className="text-muted-foreground">Subject</dt>
            <dd className="font-medium">{draft.subject}</dd>

            <dt className="text-muted-foreground">Response time</dt>
            <dd>{draft.slaHours} hours requested</dd>
          </dl>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Message</h3>
              <div className="flex items-center gap-1.5">
                {draft.aiGenerated ? (
                  <Badge variant="secondary">
                    <Sparkles />
                    AI-drafted prose
                  </Badge>
                ) : (
                  <Badge variant="outline">Standard template</Badge>
                )}
                {draft.bodyHtml && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowSource((v) => !v)}
                  >
                    <Code2 />
                    {showSource ? "Preview" : "Plain text"}
                  </Button>
                )}
              </div>
            </div>

            {draft.bodyHtml && !showSource ? (
              /*
               * Rendered in a sandboxed iframe so the approval screen shows
               * the actual email — images and all — without that markup
               * touching the dashboard's own document.
               */
              <iframe
                title="Notice preview"
                srcDoc={draft.bodyHtml}
                sandbox=""
                className="h-[28rem] w-full rounded-lg border bg-white"
              />
            ) : (
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed whitespace-pre-wrap">
                {draft.body}
              </pre>
            )}
          </div>

          {draft.routingRationale.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">Why this authority</h3>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                {draft.routingRationale.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {draft.mode === "dry_run" && (
        <Alert>
          <AlertTitle>Dry run — nothing will leave this machine</AlertTitle>
          <AlertDescription>
            The notice will be recorded against the report, but no email is
            handed to a provider. Set <code className="font-mono">EMAIL_MODE</code>{" "}
            to <code className="font-mono">sandbox</code> to deliver it.
          </AlertDescription>
        </Alert>
      )}

      {draft.redirected && (
        <Alert>
          <AlertTitle>Sandbox — redirected away from the authority</AlertTitle>
          <AlertDescription>
            This will be delivered to{" "}
            <span className="font-mono">{draft.deliverTo}</span>, not to{" "}
            <span className="font-mono">{draft.intendedTo}</span>. The real
            recipient is preserved in the subject line and the audit trail, and
            CC recipients are dropped.
          </AlertDescription>
        </Alert>
      )}

      {draft.mode === "live" && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Live — this goes to a real government inbox</AlertTitle>
          <AlertDescription>
            Sending will deliver this message to{" "}
            <span className="font-mono">{draft.intendedTo}</span>.
          </AlertDescription>
        </Alert>
      )}

      {blocked && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Delivery is not configured</AlertTitle>
          <AlertDescription>{draft.blocker}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>The notice could not be sent</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card size="sm">
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={approved}
              onCheckedChange={(value) => setApproved(value === true)}
              disabled={sending || blocked}
              className="mt-0.5"
            />
            <span>
              I have read this notice and approve sending it
              {draft.mode === "live" ? " to the authority" : ""}.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSend} disabled={!approved || sending || blocked}>
              {sending ? <Spinner /> : <Send />}
              {sending ? "Sending" : "Send notice"}
            </Button>

            <Button
              variant="outline"
              onClick={onRedraft}
              disabled={sending}
              title="Discard this draft and compose a new one"
            >
              <RefreshCw />
              Re-draft
            </Button>

            <Button variant="ghost" onClick={onBack} disabled={sending}>
              <ArrowLeft />
              Back to analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
