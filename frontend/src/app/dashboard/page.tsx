import Link from "next/link";
import { ArrowRight, Clock, Inbox, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PriorityBadge, PRIORITY_ORDER } from "@/components/dashboard/PriorityBadge";
import { statusLabel, statusStyle } from "@/lib/reportStatus";
import { getReportStats, listReports } from "@/lib/reports/queries";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const [stats, { reports }] = await Promise.all([
    getReportStats(),
    listReports({ sort: "recent", limit: 5 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Reported civic issues, their automated priority, and where each one was routed."
        actions={
          <Button render={<Link href="/dashboard/garbage-reporting" />} nativeButton={false}>
            <Plus />
            Report garbage
          </Button>
        }
      />

      {!stats.configured && (
        <Alert>
          <AlertTitle>Database not connected</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono">DATABASE_URL</code> in{" "}
            <code className="font-mono">.env.local</code>, then run{" "}
            <code className="font-mono">npx prisma migrate dev</code>. Reports
            can still be analysed, but nothing will be saved.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total reports" value={stats.total} />
        <Stat label="Open" value={stats.open} />
        <Stat label="Routed to an authority" value={stats.routed} />
        <Stat label="Resolved" value={stats.resolved} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="border-b">
            <CardTitle>Recent reports</CardTitle>
            <CardDescription>The five most recently submitted.</CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/dashboard/reports" />}
                nativeButton={false}
              >
                View all
                <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent className="px-2">
            {reports.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>No reports yet</EmptyTitle>
                  <EmptyDescription>
                    Submit a garbage incident and it will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {reports.map((report) => (
                  <Item
                    key={report.id}
                    size="sm"
                    render={<Link href={`/dashboard/reports/${report.id}`} />}
                  >
                    <ItemContent>
                      <ItemTitle>{report.title}</ItemTitle>
                      <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {report.createdAt.toLocaleDateString()}
                        </span>
                        {(report.wardName || report.address) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {report.wardName ?? report.address}
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {report.priorityLabel && (
                        <PriorityBadge
                          label={report.priorityLabel}
                          score={report.priorityScore}
                        />
                      )}
                      <Badge variant="outline" className={statusStyle(report.status)}>
                        {statusLabel(report.status)}
                      </Badge>
                    </div>
                  </Item>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>Priority distribution</CardTitle>
            <CardDescription>
              Scored 0&ndash;100 from waste volume, material severity and how
              sensitive the surrounding area is.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {PRIORITY_ORDER.map((label) => {
              const count = stats.byPriority[label];
              const share = stats.total > 0 ? (count / stats.total) * 100 : 0;

              return (
                <Link
                  key={label}
                  href={`/dashboard/reports?priority=${label}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-muted"
                >
                  <PriorityBadge label={label} className="w-24 justify-start" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How a report is handled</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n={1}
            title="Detection"
            body="A YOLOv8 model counts the waste objects in the photograph and classifies each into a material category."
          />
          <Step
            n={2}
            title="Priority"
            body="Volume, material severity and the mix of categories give a base score, escalated by nearby hospitals, schools and lakes."
          />
          <Step
            n={3}
            title="Routing"
            body="The ward office is matched from the coordinates, with hazardous material redirected to pollution control."
          />
          <Step
            n={4}
            title="Notification"
            body="A formal notice is drafted into a fixed template, logged, and delivered according to the configured email mode."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="font-heading text-2xl font-semibold tabular-nums">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums">
          {n}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
