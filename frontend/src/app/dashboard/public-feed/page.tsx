import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FeedPost } from "@/components/dashboard/FeedPost";
import {
  PRIORITY_ORDER,
  priorityText,
  type PriorityLabel,
} from "@/components/dashboard/PriorityBadge";
import { listFeed, parsePriority } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ priority?: string }>;
}

export default async function PublicFeedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const priority = parsePriority(params.priority);

  const { reports, error, configured, handles } = await listFeed({
    priority,
    sort: "priority",
    limit: 50,
  });

  const hrefFor = (next: PriorityLabel | null) =>
    next ? `/dashboard/public-feed?priority=${next}` : "/dashboard/public-feed";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Public feed
          </h1>
          <p className="text-sm text-muted-foreground">
            What the city is reporting, highest priority first.
          </p>
        </div>

        <Button
          size="sm"
          render={<Link href="/dashboard/garbage-reporting" />}
          nativeButton={false}
        >
          <Plus />
          Post
        </Button>
      </div>

      {/* Filter rail, kept as links so a filtered feed stays shareable. */}
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1">
        <FilterPill href={hrefFor(null)} active={priority === null}>
          All
        </FilterPill>
        {PRIORITY_ORDER.map((label) => (
          <FilterPill
            key={label}
            href={hrefFor(label)}
            active={priority === label}
          >
            {priorityText(label)}
          </FilterPill>
        ))}
      </div>

      {error && (
        <Alert variant={configured ? "destructive" : "default"}>
          <AlertTitle>
            {configured ? "Feed could not be loaded" : "Database not connected"}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && reports.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 />
            </EmptyMedia>
            <EmptyTitle>
              {priority ? "Nothing at this priority" : "Nothing reported yet"}
            </EmptyTitle>
            <EmptyDescription>
              Reports appear here as soon as they are assessed.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              render={<Link href="/dashboard/garbage-reporting" />}
              nativeButton={false}
            >
              <Plus />
              Report an issue
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {reports.length > 0 && (
        <div className="space-y-5">
          {reports.map((report) => (
            <FeedPost
              key={report.id}
              report={report}
              handle={
                report.anonymousId
                  ? (handles.get(report.anonymousId) ?? null)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
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
        "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
