import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { hueFor } from "@/components/dashboard/news/SourceMark";
import { timeAgo } from "@/lib/timeAgo";
import type { CivicNewsItem } from "@/lib/news/types";

/**
 * A market-ticker style crawl of the latest civic headlines.
 *
 * The scroll is one CSS animation on a track holding the headlines twice
 * over, so translating it by exactly half its width loops seamlessly with no
 * client JavaScript, no measuring and no timers — see `.news-ticker-track` in
 * globals.css, which also pauses on hover and stops outright under
 * prefers-reduced-motion.
 *
 * The duplicate copy is hidden from assistive technology; a screen reader
 * hears each headline once, in a plain list.
 */
export function NewsTicker({ items }: { items: CivicNewsItem[] }) {
  if (items.length === 0) return null;

  // Roughly constant reading speed regardless of how many headlines landed.
  const duration = Math.max(items.length * 6, 30);

  return (
    <section
      aria-label="Latest civic news"
      className="news-ticker flex items-stretch overflow-hidden rounded-xl border bg-card"
    >
      <h2 className="z-10 flex shrink-0 items-center gap-2 border-r bg-card px-3.5 text-[11px] font-semibold tracking-widest uppercase">
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        <span className="hidden sm:inline">Civic wire</span>
      </h2>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="news-ticker-track"
          style={{ "--news-ticker-duration": `${duration}s` } as React.CSSProperties}
        >
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center"
            >
              {items.map((item) => (
                <TickerHeadline key={`${copy}-${item.id}`} item={item} />
              ))}
            </div>
          ))}
        </div>

        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent"
        />
      </div>

      <Link
        href="/dashboard/news"
        className="z-10 flex shrink-0 items-center gap-1 border-l bg-card px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="hidden sm:inline">All news</span>
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

function TickerHeadline({ item }: { item: CivicNewsItem }) {
  const published = new Date(item.publishedAt);
  const hue = hueFor(item.sourceDomain ?? item.source);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs whitespace-nowrap"
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: `oklch(0.62 0.13 ${hue})` }}
      />
      <span className="font-medium transition-colors group-hover:text-primary">
        {item.title}
      </span>
      <span className="text-muted-foreground">{item.source}</span>
      <time
        dateTime={item.publishedAt}
        className="text-muted-foreground tabular-nums"
      >
        {timeAgo(published)}
      </time>
      <span aria-hidden className="pl-2 text-border">
        &#124;
      </span>
    </a>
  );
}
