import type { NewsTopicId } from "./topics";

/** A headline normalised away from whichever provider supplied it. */
export interface CivicNewsItem {
  /** Stable within a feed — derived from the article URL, not the provider's id. */
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  /** Used for the source favicon; null when the URL could not be parsed. */
  sourceDomain: string | null;
  imageUrl: string | null;
  /** ISO 8601. Already validated — never an unparseable provider string. */
  publishedAt: string;
  topic: NewsTopicId;
}

export type NewsProvider = "google-news-rss" | "gnews";

export interface CivicNewsFeed {
  items: CivicNewsItem[];
  /** Whichever provider actually served these items, not the one configured. */
  provider: NewsProvider;
  topic: NewsTopicId;
  /** ISO 8601 — when this response was assembled, not when it was cached. */
  fetchedAt: string;
  /** Set when every provider failed. `items` is then empty rather than stale. */
  error: string | null;
  /**
   * Set when the configured provider failed but a fallback served the feed.
   * The headlines are real; this explains why they came from elsewhere.
   */
  notice: string | null;
}
