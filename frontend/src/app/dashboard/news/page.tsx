import Link from "next/link";
import { Newspaper, RadioTower, SatelliteDish } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { NewsCard, NewsLeadCard } from "@/components/dashboard/news/NewsCard";
import { fetchCivicNews } from "@/lib/news/fetchCivicNews";
import {
  NEWS_TOPICS,
  resolveTopic,
  type NewsTopicId,
} from "@/lib/news/topics";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

/*
 * Civic news is read live and never stored: no table, no cron, no sync. The
 * provider response is cached for fifteen minutes inside fetchCivicNews, so
 * rendering on every request costs nothing beyond that window.
 */
export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  "google-news-rss": "Google News",
  gnews: "GNews",
};

interface PageProps {
  searchParams: Promise<{ topic?: string }>;
}

export default async function CivicNewsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const topic = resolveTopic(params.topic);

  const feed = await fetchCivicNews({ topic: topic.id, limit: 24 });
  const [lead, ...rest] = feed.items;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Civic news"
        description={topic.description}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            <SatelliteDish className="size-3.5" />
            {PROVIDER_LABEL[feed.provider] ?? feed.provider}
            {feed.items.length > 0 && (
              <>
                <span aria-hidden>&middot;</span>
                <time dateTime={feed.fetchedAt} className="tabular-nums">
                  {timeAgo(new Date(feed.fetchedAt))}
                </time>
              </>
            )}
          </span>
        }
      />

      <TopicNav active={topic.id} />

      {feed.notice && (
        <Alert>
          <AlertTitle>Reading from the fallback provider</AlertTitle>
          <AlertDescription>{feed.notice}</AlertDescription>
        </Alert>
      )}

      {feed.error ? (
        <Alert>
          <AlertTitle>Headlines are unavailable</AlertTitle>
          <AlertDescription>
            Nothing is cached locally, so there is nothing to show until a
            provider responds. {feed.error}
          </AlertDescription>
        </Alert>
      ) : feed.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Newspaper />
            </EmptyMedia>
            <EmptyTitle>Nothing on this beat yet</EmptyTitle>
            <EmptyDescription>
              No {topic.label.toLowerCase()} coverage was published in the last{" "}
              {topic.days} days. Another topic may be busier.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/news" />}
              nativeButton={false}
            >
              <RadioTower />
              All civic news
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <NewsLeadCard item={lead} />

          {rest.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rest.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Headlines are fetched live from{" "}
            {PROVIDER_LABEL[feed.provider] ?? feed.provider} and are not stored
            by CivicBridge. Each one opens at its publisher.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Topics are links rather than client state, so a beat is shareable, the back
 * button behaves, and the page stays a server component with no loading
 * flicker between topics.
 */
function TopicNav({ active }: { active: NewsTopicId }) {
  return (
    <nav
      aria-label="News topic"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {NEWS_TOPICS.map((topic) => {
        const isActive = topic.id === active;

        return (
          <Link
            key={topic.id}
            href={
              topic.id === "all" ? "/dashboard/news" : `/dashboard/news?topic=${topic.id}`
            }
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {topic.label}
          </Link>
        );
      })}
    </nav>
  );
}
