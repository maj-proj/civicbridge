import Link from "next/link";
import { Map as MapIcon, MapPin, MessageSquare, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/dashboard/PriorityBadge";
import { reportTypeLabel, statusLabel, statusStyle } from "@/lib/reportStatus";
import { timeAgo } from "@/lib/timeAgo";
import type { ReportListItem } from "@/lib/reports/queries";

function initials(handle: string): string {
  const cleaned = handle.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(0, 2) || "??").toUpperCase();
}

/**
 * One report rendered as a feed post.
 *
 * The action row deliberately carries real actions — opening the location and
 * the report timeline — rather than likes or comments. Nothing in the schema
 * stores engagement, and a button that silently does nothing would be worse
 * than no button.
 */
export function FeedPost({
  report,
  handle,
}: {
  report: ReportListItem;
  handle: string | null;
}) {
  const image = report.annotatedImageUrl ?? report.imageUrl;
  const author = handle ? `@${handle}` : "Anonymous reporter";
  const place = report.wardName ?? report.address;

  const mapsHref =
    report.latitude != null && report.longitude != null
      ? `https://www.google.com/maps?q=${report.latitude},${report.longitude}`
      : null;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-medium">
            {handle ? initials(handle) : "AN"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{author}</div>
          {place && (
            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{place}</span>
            </div>
          )}
        </div>

        <Badge variant="secondary">{reportTypeLabel(report.type)}</Badge>
      </header>

      <Link
        href={`/dashboard/reports/${report.id}`}
        className="block bg-muted"
        aria-label={`Open ${report.title}`}
      >
        {image ? (
          /* Remote hosts are not configured for next/image. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt={report.title}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center">
            <Trash2 className="size-8 text-muted-foreground" />
          </div>
        )}
      </Link>

      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
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

        <p className="text-sm leading-relaxed">
          <span className="font-medium">{author}</span>{" "}
          <span>{report.title}</span>
        </p>

        {report.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {report.description}
          </p>
        )}

        {report.authority && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="mt-0.5 size-3 shrink-0" />
            Routed to {report.authority.name}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={`/dashboard/reports/${report.id}`} />}
              nativeButton={false}
            >
              View details
            </Button>

            {mapsHref && (
              <Button
                variant="ghost"
                size="sm"
                render={
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" />
                }
                nativeButton={false}
              >
                <MapIcon />
                Map
              </Button>
            )}
          </div>

          <time
            dateTime={report.createdAt.toISOString()}
            title={report.createdAt.toLocaleString()}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {timeAgo(report.createdAt)}
          </time>
        </div>
      </div>
    </Card>
  );
}
