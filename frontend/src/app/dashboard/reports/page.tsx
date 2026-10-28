import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  PriorityBadge,
  PRIORITY_ORDER,
  priorityText,
  type PriorityLabel,
} from "@/components/dashboard/PriorityBadge";
import { reportTypeLabel, statusLabel, statusStyle } from "@/lib/reportStatus";
import { listReports, parsePriority, parseSort } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ priority?: string; sort?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const priority = parsePriority(params.priority);
  const sort = parseSort(params.sort);

  const { reports, total, error, configured } = await listReports({
    priority,
    sort,
    limit: 50,
  });

  // Filters are links rather than client state, so a filtered view is
  // shareable and the back button behaves.
  const hrefFor = (next: { priority?: PriorityLabel | null; sort?: string }) => {
    const query = new URLSearchParams();
    const nextPriority = next.priority === undefined ? priority : next.priority;
    const nextSort = next.sort ?? sort;

    if (nextPriority) query.set("priority", nextPriority);
    if (nextSort !== "priority") query.set("sort", nextSort);

    const qs = query.toString();
    return `/dashboard/reports${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every logged incident, its automated priority assessment, and the authority it was routed to."
        actions={
          <Button render={<Link href="/dashboard/garbage-reporting" />} nativeButton={false}>
            <Plus />
            Report garbage
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterLink href={hrefFor({ priority: null })} active={priority === null}>
            All
          </FilterLink>
          {PRIORITY_ORDER.map((label) => (
            <FilterLink
              key={label}
              href={hrefFor({ priority: label })}
              active={priority === label}
            >
              {priorityText(label)}
            </FilterLink>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-sm text-muted-foreground">Sort</span>
          <FilterLink href={hrefFor({ sort: "priority" })} active={sort === "priority"}>
            Priority
          </FilterLink>
          <FilterLink href={hrefFor({ sort: "recent" })} active={sort === "recent"}>
            Recent
          </FilterLink>
        </div>
      </div>

      {/* A missing DATABASE_URL is a setup step, not a failure, so it is not
          dressed up as an error. */}
      {error && (
        <Alert variant={configured ? "destructive" : "default"}>
          <AlertTitle>
            {configured ? "Reports could not be loaded" : "Database not connected"}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && reports.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No reports found</EmptyTitle>
            <EmptyDescription>
              {priority
                ? "No reports match this priority band."
                : "Submit a garbage incident to see it appear here."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/dashboard/garbage-reporting" />} nativeButton={false}>
              <Plus />
              Report garbage
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        reports.length > 0 && (
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead className="hidden md:table-cell">Authority</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Submitted
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/reports/${report.id}`}
                        className="block space-y-1"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium hover:underline">
                            {report.title}
                          </span>
                          <Badge variant="secondary">
                            {reportTypeLabel(report.type)}
                          </Badge>
                        </span>
                        {(report.wardName || report.address) && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {report.wardName ?? report.address}
                          </span>
                        )}
                      </Link>
                    </TableCell>

                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {report.authority?.name ?? "—"}
                    </TableCell>

                    <TableCell>
                      {report.priorityLabel ? (
                        <PriorityBadge
                          label={report.priorityLabel}
                          score={report.priorityScore}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={statusStyle(report.status)}>
                        {statusLabel(report.status)}
                      </Badge>
                    </TableCell>

                    <TableCell className="hidden text-right text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                      {report.createdAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <CardContent className="border-t py-3 text-xs text-muted-foreground">
              Showing {reports.length} of {total}
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2.5 py-1 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
