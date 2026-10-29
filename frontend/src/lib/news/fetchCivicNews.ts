/**
 * Civic issue headlines, read straight from a news provider.
 *
 * Nothing here is persisted: the feature is a passthrough, so a page render
 * costs one outbound request and the only state is Next's fetch cache.
 *
 * Two providers, picked in this order:
 *
 *   gnews            when GNEWS_API_KEY is set. Returns article images.
 *   google-news-rss  otherwise. No key, no quota, no images.
 *
 * The keyless RSS path is the default on purpose — the feature has to work on
 * a clean checkout with an empty .env.local, the same way reverse geocoding
 * does.
 *
 * Every failure is non-fatal: a provider outage degrades the news section to
 * an empty state and must never take a dashboard page down with it.
 */

import "server-only";
import {
  normalizeNewsItems,
  stripTrailingSource,
  trailingSource,
  type RawNewsItem,
} from "./normalize";
import { parseRssItems } from "./parseRss";
import { resolveTopic, type NewsTopic, type NewsTopicId } from "./topics";
import type { CivicNewsFeed, NewsProvider } from "./types";

const TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 24;

/**
 * Seconds Next may serve a cached provider response for. News does not move
 * fast enough to justify a request per page view, and the free tiers are
 * small enough that doing so would exhaust them.
 */
const REVALIDATE_SECONDS = 900;

export interface FetchCivicNewsOptions {
  topic?: NewsTopicId;
  limit?: number;
  /** Region hints; Google News and GNews both accept them. */
  language?: string;
  country?: string;
}

export async function fetchCivicNews(
  options: FetchCivicNewsOptions = {}
): Promise<CivicNewsFeed> {
  const topic = resolveTopic(options.topic);
  const limit = clamp(options.limit ?? DEFAULT_LIMIT, 1, 60);
  const language = options.language ?? process.env.NEWS_LANGUAGE ?? "en";
  const country = options.country ?? process.env.NEWS_COUNTRY ?? "in";

  const apiKey = process.env.GNEWS_API_KEY?.trim();

  // A configured key is a preference, not a commitment. An unverified
  // account, an exhausted quota or a typo in the key should degrade the
  // feature to the keyless provider, not empty it — so GNews is tried first
  // and Google News remains the backstop.
  const attempts: NewsProvider[] = apiKey
    ? ["gnews", "google-news-rss"]
    : ["google-news-rss"];

  let notice: string | null = null;

  for (const [index, provider] of attempts.entries()) {
    const isLastAttempt = index === attempts.length - 1;

    try {
      const raw =
        provider === "gnews"
          ? await fetchFromGNews(topic, { apiKey: apiKey!, language, country })
          : await fetchFromGoogleNewsRss(topic, { language, country });

      return {
        items: normalizeNewsItems(raw, topic, limit),
        provider,
        topic: topic.id,
        fetchedAt: new Date().toISOString(),
        error: null,
        notice,
      };
    } catch (error) {
      const detail = describe(error);
      console.warn(`News lookup failed (${provider}): ${detail}`);

      if (isLastAttempt) {
        return {
          items: [],
          provider,
          topic: topic.id,
          fetchedAt: new Date().toISOString(),
          error: detail,
          notice,
        };
      }

      notice =
        `GNEWS_API_KEY is set but GNews rejected the request, so these ` +
        `headlines came from Google News instead. GNews said: ${detail}`;
    }
  }

  // Unreachable: `attempts` always holds at least the keyless provider.
  throw new Error("No news provider was attempted.");
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError"
      ? "the provider did not respond in time."
      : error.message;
  }

  return "the provider could not be reached.";
}

// ---------------------------------------------------------------------------
// Google News RSS — the keyless default
// ---------------------------------------------------------------------------

async function fetchFromGoogleNewsRss(
  topic: NewsTopic,
  region: { language: string; country: string }
): Promise<RawNewsItem[]> {
  const country = region.country.toUpperCase();
  const query = `${topic.query} when:${topic.days}d`;

  const url =
    "https://news.google.com/rss/search" +
    `?q=${encodeURIComponent(query)}` +
    `&hl=${encodeURIComponent(`${region.language}-${country}`)}` +
    `&gl=${encodeURIComponent(country)}` +
    `&ceid=${encodeURIComponent(`${country}:${region.language}`)}`;

  const xml = await request(url, {
    Accept: "application/rss+xml, text/xml",
  }).then((response) => response.text());

  return parseRssItems(xml).map((item) => {
    const source = item.source ?? trailingSource(item.title);

    return {
      title: source ? stripTrailingSource(item.title, source) : item.title,
      // Google's <description> is a list of related links, not a summary.
      summary: null,
      url: item.link,
      source: source ?? "Google News",
      // <link> is a Google redirect, so the publisher's own domain has to
      // come from the <source> element instead.
      sourceUrl: item.sourceUrl,
      imageUrl: null,
      publishedAt: item.pubDate,
    };
  });
}

// ---------------------------------------------------------------------------
// GNews — used when a key is configured
// ---------------------------------------------------------------------------

interface GNewsArticle {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  publishedAt?: string;
  source?: { name?: string; url?: string };
}

async function fetchFromGNews(
  topic: NewsTopic,
  config: { apiKey: string; language: string; country: string }
): Promise<RawNewsItem[]> {
  const from = new Date(Date.now() - topic.days * 86_400_000).toISOString();

  // GNews rejects a `max` above the subscribed plan's ceiling rather than
  // clamping it, and the free plan's ceiling is 10. Defaulting to the free
  // limit means a working key works immediately; paid plans raise it.
  const max = clamp(Number(process.env.GNEWS_MAX_ARTICLES ?? 10), 1, 100);

  const url =
    "https://gnews.io/api/v4/search" +
    `?q=${encodeURIComponent(topic.query)}` +
    `&lang=${encodeURIComponent(config.language)}` +
    `&country=${encodeURIComponent(config.country)}` +
    `&from=${encodeURIComponent(from)}` +
    `&sortby=publishedAt&max=${max}` +
    `&apikey=${encodeURIComponent(config.apiKey)}`;

  const response = await request(url, { Accept: "application/json" });
  const data = (await response.json()) as { articles?: GNewsArticle[] };

  return (data.articles ?? []).map((article) => ({
    title: article.title ?? "",
    summary: article.description ?? null,
    url: article.url ?? "",
    source: article.source?.name ?? "GNews",
    sourceUrl: article.source?.url ?? null,
    imageUrl: article.image ?? null,
    publishedAt: article.publishedAt ?? null,
  }));
}

// ---------------------------------------------------------------------------

async function request(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      ...headers,
      // Google News serves a stub to unrecognised clients.
      "User-Agent":
        process.env.NEWS_USER_AGENT ?? "CivicBridge/0.1 (civic issue reporting)",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    // The status alone is not diagnosable — GNews answers 403 both for an
    // unverified account and for a bad key, and only the body says which.
    // The query string is dropped from the message because it carries the key.
    const detail = await errorDetail(response);
    throw new Error(
      `${new URL(url).host} responded ${response.status}` +
        (detail ? `: ${detail}` : "")
    );
  }

  return response;
}

/** The provider's own explanation, if it gave one worth repeating. */
async function errorDetail(response: Response): Promise<string | null> {
  try {
    const body = await response.text();

    try {
      const parsed = JSON.parse(body) as {
        errors?: unknown;
        message?: unknown;
        error?: unknown;
      };

      const message = Array.isArray(parsed.errors)
        ? parsed.errors.filter((e) => typeof e === "string").join(" ")
        : parsed.message ?? parsed.error ?? parsed.errors;

      if (typeof message === "string" && message.trim()) {
        return truncate(message.trim());
      }
    } catch {
      // Not JSON — an HTML error page is not worth showing a reader.
    }

    return null;
  } catch {
    return null;
  }
}

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
