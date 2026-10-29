import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SourceMark } from "@/components/dashboard/news/SourceMark";
import { timeAgo } from "@/lib/timeAgo";
import type { CivicNewsItem } from "@/lib/news/types";

/**
 * One headline.
 *
 * Every card is an outbound link rather than a detail route: the article is
 * not ours, nothing about it is stored, and sending the reader to the
 * publisher is the whole point.
 *
 * The keyless provider returns no images, so the card has to read well on
 * type alone — the publisher mark carries the visual weight, and an image is
 * treated as a bonus rather than the layout's backbone.
 */
export function NewsCard({ item }: { item: CivicNewsItem }) {
  const published = new Date(item.publishedAt);

  return (
    <Card size="sm" className="group gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full flex-col"
      >
        {item.imageUrl && (
          /* Remote hosts are not configured for next/image. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="aspect-video w-full border-b object-cover"
          />
        )}

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2.5">
            <SourceMark source={item.source} domain={item.sourceDomain} />

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{item.source}</div>
              <time
                dateTime={item.publishedAt}
                title={published.toLocaleString()}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {timeAgo(published)} ago
              </time>
            </div>
          </div>

          <h3 className="line-clamp-3 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
            {item.title}
          </h3>

          {item.summary && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
          )}

          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-muted-foreground transition-colors group-hover:text-primary">
            {item.sourceDomain ?? "Read the article"}
            <ArrowUpRight className="size-3" />
          </span>
        </div>
      </a>
    </Card>
  );
}

/**
 * The newest headline, given the width of the page.
 *
 * Deliberately not a hero image — with no images from the default provider,
 * scale and a tinted surface do the work instead.
 */
export function NewsLeadCard({ item }: { item: CivicNewsItem }) {
  const published = new Date(item.publishedAt);

  return (
    <Card className="group relative overflow-hidden border-primary/20 bg-gradient-to-br from-accent/70 via-card to-card p-0">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-primary"
      />

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-8"
      >
        {item.imageUrl && (
          /* Remote hosts are not configured for next/image. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            className="aspect-video w-full rounded-xl border object-cover lg:w-2/5"
          />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="secondary">Top story</Badge>
            <SourceMark
              source={item.source}
              domain={item.sourceDomain}
              className="size-6 rounded-md text-[10px]"
            />
            <span className="text-xs font-medium">{item.source}</span>
            <span aria-hidden className="text-muted-foreground">
              &middot;
            </span>
            <time
              dateTime={item.publishedAt}
              title={published.toLocaleString()}
              className="text-xs text-muted-foreground tabular-nums"
            >
              {timeAgo(published)} ago
            </time>
          </div>

          <h2 className="font-heading text-lg leading-tight font-semibold tracking-tight transition-colors group-hover:text-primary sm:text-xl">
            {item.title}
          </h2>

          {item.summary && (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
          )}

          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Read the full story
            <ArrowUpRight className="size-4" />
          </span>
        </div>
      </a>
    </Card>
  );
}
