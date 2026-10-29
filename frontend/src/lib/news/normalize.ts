/**
 * Provider rows -> the feed the UI renders.
 *
 * Each news provider has its own shape, its own idea of a date and its own
 * tolerance for duplicate wire copy. Everything that smooths those
 * differences lives here, pure and independent of how the rows were
 * fetched.
 */

import type { NewsTopic, NewsTopicId } from "./topics";
import type { CivicNewsItem } from "./types";

/** A provider row before validation, deduplication and sorting. */
export interface RawNewsItem {
  title: string;
  summary: string | null;
  url: string;
  source: string;
  /** The publisher's own site, when the provider names it separately. */
  sourceUrl?: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Hosts that republish other outlets' work. A link through one of these says
 * nothing about who reported the story, so it is not shown as the source.
 */
const AGGREGATOR_HOSTS = new Set([
  "news.google.com",
  "news.yahoo.com",
  "flipboard.com",
]);

/**
 * Drops anything unusable, collapses duplicate coverage of one story, then
 * returns the newest `limit` headlines.
 */
export function normalizeNewsItems(
  raw: RawNewsItem[],
  topic: Pick<NewsTopic, "id" | "days">,
  limit: number,
  now: number = Date.now()
): CivicNewsItem[] {
  const cutoff = now - topic.days * DAY_MS;
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const items: CivicNewsItem[] = [];

  for (const entry of raw) {
    const title = collapse(entry.title);
    if (!title || !entry.url) continue;

    const published = Date.parse(entry.publishedAt ?? "");
    if (!Number.isFinite(published) || published < cutoff) continue;

    // Syndicated copy reaches us once per outlet; one is enough.
    const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seenUrls.has(entry.url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(entry.url);
    seenTitles.add(titleKey);

    items.push({
      id: hash(entry.url),
      title,
      summary: entry.summary ? collapse(entry.summary) || null : null,
      url: entry.url,
      source: collapse(entry.source) || "Unknown source",
      sourceDomain: publisherDomain(entry),
      imageUrl: entry.imageUrl,
      publishedAt: new Date(published).toISOString(),
      topic: topic.id as NewsTopicId,
    });
  }

  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return items.slice(0, Math.max(limit, 0));
}

export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The domain to show as the publisher, or null when only an aggregator's is
 * on offer — the UI then falls back to the publisher's name alone, which is
 * better than labelling every card news.google.com.
 */
export function publisherDomain(
  entry: Pick<RawNewsItem, "url" | "sourceUrl">
): string | null {
  for (const candidate of [entry.sourceUrl, entry.url]) {
    const domain = candidate ? domainOf(candidate) : null;
    if (domain && !AGGREGATOR_HOSTS.has(domain)) return domain;
  }

  return null;
}

/** Short, stable, collision-tolerant key for a React list (FNV-1a). */
export function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Google News appends " - Publisher" to every headline it syndicates. Returns
 * the publisher, or null when the tail looks like part of the headline.
 */
export function trailingSource(title: string): string | null {
  const index = title.lastIndexOf(" - ");
  if (index < 0) return null;

  const tail = title.slice(index + 3).trim();
  return tail.length > 0 && tail.length <= 40 ? tail : null;
}

export function stripTrailingSource(title: string, source: string): string {
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}
