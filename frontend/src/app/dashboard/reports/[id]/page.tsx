import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PriorityScore } from "@/components/dashboard/PriorityBadge";
import {
  CompositionBars,
  ScoreFactors,
  type BreakdownFactor,
  type CategoryRow,
} from "@/components/dashboard/ReportInsights";
import { StatusAdvanceButton } from "@/components/dashboard/StatusAdvanceButton";
import { STATUS_SEQUENCE, statusLabel, statusStyle } from "@/lib/reportStatus";
import { getReportDetail } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const report = await getReportDetail(id);

  if (!report) notFound();

  // Prisma Json columns are untyped at the edge of the database.
  const breakdown = report.scoreBreakdown as {
    factors?: BreakdownFactor[];
    summary?: string[];
  } | null;

  const categories = (report.categoryDistribution as CategoryRow[] | null) ?? [];

  const currentIndex = STATUS_SEQUENCE.indexOf(
    report.status as (typeof STATUS_SEQUENCE)[number]
  );
  const nextStatus =
    currentIndex >= 0 && currentIndex < STATUS_SEQUENCE.length - 1
      ? STATUS_SEQUENCE[currentIndex + 1]
      : null;

  const heroImage = report.annotatedImageUrl ?? report.imageUrl;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All reports
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {report.id.slice(0, 8).toUpperCase()}
            </span>
            <Badge variant="outline" className={statusStyle(report.status)}>
              {statusLabel(report.status)}
            </Badge>
          </div>

          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {report.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {report.createdAt.toLocaleString()}
            </span>
            {(report.wardName || report.address) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {report.wardName ?? report.address}
              </span>
            )}
            {report.recurrenceCount > 0 && (
              <span>
                {report.recurrenceCount} prior report
                {report.recurrenceCount === 1 ? "" : "s"} nearby
              </span>
            )}
          </div>
        </div>

        {report.priorityLabel && (
          <PriorityScore
            label={report.priorityLabel}
            score={report.priorityScore}
          />
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {heroImage && (
            <Card className="gap-0 py-0">
              {/* Remote hosts are not configured for next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImage}
                alt="Waste evidence"
                className="max-h-96 w-full object-cover"
              />
              <CardContent className="border-t py-2.5 text-xs text-muted-foreground">
                {report.annotatedImageUrl
                  ? "YOLOv8 detection overlay"
                  : "Citizen photograph"}
              </CardContent>
            </Card>
          )}

          {report.description && (
            <Card>
              <CardHeader>
                <CardTitle>Citizen description</CardTitle>
              </CardHeader>
              <CardContent className="leading-relaxed text-muted-foreground">
                {report.description}
              </CardContent>
            </Card>
          )}

          {categories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Material composition</CardTitle>
                <CardDescription>
                  {report.totalObjects ?? 0}{" "}
                  {report.totalObjects === 1 ? "object" : "objects"} detected
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CompositionBars rows={categories} />
              </CardContent>
            </Card>
          )}

          {breakdown?.factors && breakdown.factors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Why this score</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreFactors factors={breakdown.factors} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Routed authority</CardTitle>
            </CardHeader>
            <CardContent>
              {report.authority ? (
                <div className="space-y-1">
                  <div className="font-medium">{report.authority.name}</div>
                  {report.authority.designation && (
                    <div className="text-sm text-muted-foreground">
                      {report.authority.designation}
                    </div>
                  )}
                  <div className="font-mono text-xs break-all text-muted-foreground">
                    {report.authority.email}
                  </div>
                  <Badge variant="secondary" className="mt-1.5">
                    {statusLabel(report.authority.department)}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No authority has been resolved for this report yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                What was sent, and where it actually went.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.emails.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No notification has been composed yet.
                </p>
              )}

              {report.emails.map((email) => (
                <div key={email.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        email.status === "SENT" &&
                          "border-emerald-200 bg-emerald-50 text-emerald-700",
                        email.status === "FAILED" &&
                          "border-rose-200 bg-rose-50 text-rose-700"
                      )}
                    >
                      {statusLabel(email.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {email.mode}
                    </span>
                  </div>

                  <div className="text-sm font-medium">{email.subject}</div>

                  <dl className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt className="shrink-0">Intended</dt>
                      <dd className="truncate font-mono">{email.intendedTo}</dd>
                    </div>
                    {email.actualTo !== email.intendedTo && (
                      <div className="flex gap-1.5">
                        <dt className="shrink-0">Delivered</dt>
                        <dd className="truncate font-mono">{email.actualTo}</dd>
                      </div>
                    )}
                    {email.ccEmails.length > 0 && (
                      <div className="flex gap-1.5">
                        <dt className="shrink-0">CC</dt>
                        <dd className="truncate font-mono">
                          {email.ccEmails.join(", ")}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {email.error && (
                    <p className="text-xs text-destructive">{email.error}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-0">
                {report.statusEvents.map((event, index) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      {index < report.statusEvents.length - 1 && (
                        <span className="w-px flex-1 bg-border" />
                      )}
                    </div>

                    <div className="pb-4">
                      <div className="text-sm font-medium">
                        {statusLabel(event.toStatus)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {event.createdAt.toLocaleString()}
                        {event.actor ? ` · ${event.actor}` : ""}
                      </div>
                      {event.note && (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {event.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {nextStatus && (
                <>
                  <Separator className="mb-3" />
                  <StatusAdvanceButton
                    reportId={report.id}
                    nextStatus={nextStatus}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
