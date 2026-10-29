import test from "node:test";
import assert from "node:assert/strict";

import {
  domainOf,
  normalizeNewsItems,
  publisherDomain,
  stripTrailingSource,
  trailingSource,
  type RawNewsItem,
} from "./normalize";
import { decodeEntities, parseRssItems } from "./parseRss";

/*
 * The news feature has no database, so these two modules are the whole of its
 * correctness: whatever a provider sends has to survive parsing, dating and
 * deduplication before the UI sees it.
 */

const NOW = Date.parse("2026-10-29T12:00:00Z");

function raw(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    title: "Ward office clears dumping ground",
    summary: null,
    url: "https://example.com/a",
    source: "The Example",
    imageUrl: null,
    publishedAt: "2026-10-29T09:00:00Z",
    ...overrides,
  };
}

const TOPIC = { id: "waste" as const, days: 14 };

test("keeps a usable headline and derives the source domain", () => {
  const [item] = normalizeNewsItems([raw()], TOPIC, 10, NOW);

  assert.equal(item.title, "Ward office clears dumping ground");
  assert.equal(item.sourceDomain, "example.com");
  assert.equal(item.publishedAt, "2026-10-29T09:00:00.000Z");
  assert.equal(item.topic, "waste");
});

test("drops rows with no title, no url or an unparseable date", () => {
  const items = normalizeNewsItems(
    [
      raw({ title: "   ", url: "https://example.com/1" }),
      raw({ url: "", title: "No link" }),
      raw({ url: "https://example.com/2", publishedAt: "not a date" }),
      raw({ url: "https://example.com/3", publishedAt: null }),
    ],
    TOPIC,
    10,
    NOW
  );

  assert.deepEqual(items, []);
});

test("drops headlines older than the topic window", () => {
  const items = normalizeNewsItems(
    [
      raw({ url: "https://example.com/fresh", publishedAt: "2026-10-20T00:00:00Z" }),
      raw({
        title: "Old story",
        url: "https://example.com/stale",
        publishedAt: "2026-09-01T00:00:00Z",
      }),
    ],
    TOPIC,
    10,
    NOW
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://example.com/fresh");
});

test("collapses syndicated copy of one story across outlets", () => {
  const items = normalizeNewsItems(
    [
      raw({ title: "BMC begins pothole audit", url: "https://a.com/x" }),
      raw({ title: "BMC  begins   pothole audit", url: "https://b.com/y" }),
      raw({ title: "bmc begins pothole audit!", url: "https://c.com/z" }),
    ],
    TOPIC,
    10,
    NOW
  );

  assert.equal(items.length, 1);
});

test("returns the newest headlines first and honours the limit", () => {
  const items = normalizeNewsItems(
    [
      raw({ title: "Oldest", url: "https://e.com/1", publishedAt: "2026-10-25T00:00:00Z" }),
      raw({ title: "Newest", url: "https://e.com/2", publishedAt: "2026-10-29T06:00:00Z" }),
      raw({ title: "Middle", url: "https://e.com/3", publishedAt: "2026-10-27T00:00:00Z" }),
    ],
    TOPIC,
    2,
    NOW
  );

  assert.deepEqual(
    items.map((item) => item.title),
    ["Newest", "Middle"]
  );
});

test("domainOf strips www and tolerates a malformed url", () => {
  assert.equal(domainOf("https://www.thehindu.com/news/x"), "thehindu.com");
  assert.equal(domainOf("not a url"), null);
});

test("the publisher domain is preferred over an aggregator redirect", () => {
  // What Google News actually hands us: the link is a Google redirect, and
  // only <source url> names who reported the story.
  assert.equal(
    publisherDomain({
      url: "https://news.google.com/rss/articles/CBMiabc123?oc=5",
      sourceUrl: "https://www.thehindu.com",
    }),
    "thehindu.com"
  );

  // Nothing but the aggregator: better to show no domain than Google's.
  assert.equal(
    publisherDomain({
      url: "https://news.google.com/rss/articles/CBMiabc123?oc=5",
      sourceUrl: null,
    }),
    null
  );

  // A provider that links straight to the article needs no source url.
  assert.equal(
    publisherDomain({ url: "https://indianexpress.com/article/x" }),
    "indianexpress.com"
  );
});

test("an item keeps the publisher domain, not the redirect host", () => {
  const [item] = normalizeNewsItems(
    [
      raw({
        url: "https://news.google.com/rss/articles/CBMixyz?oc=5",
        sourceUrl: "https://www.deccanherald.com",
        source: "Deccan Herald",
      }),
    ],
    TOPIC,
    10,
    NOW
  );

  assert.equal(item.sourceDomain, "deccanherald.com");
});

test("trailingSource takes a publisher but not a hyphenated headline", () => {
  assert.equal(
    trailingSource("Potholes return to Outer Ring Road - Deccan Herald"),
    "Deccan Herald"
  );
  assert.equal(trailingSource("Civic body acts on garbage"), null);
  assert.equal(
    trailingSource(
      "Civic body acts - after a decade of complaints from residents of the ward"
    ),
    null
  );

  assert.equal(
    stripTrailingSource("Potholes return - Deccan Herald", "Deccan Herald"),
    "Potholes return"
  );
  assert.equal(
    stripTrailingSource("Potholes return", "Deccan Herald"),
    "Potholes return"
  );
});

test("parseRssItems reads title, link, date and source from an item", () => {
  const items = parseRssItems(`
    <rss><channel>
      <item>
        <title>Garbage piles up in Ward 12 &amp; 13 - Times of India</title>
        <link>https://timesofindia.com/city/ward-12</link>
        <pubDate>Wed, 28 Oct 2026 04:30:00 GMT</pubDate>
        <source url="https://timesofindia.com">Times of India</source>
      </item>
      <item>
        <title><![CDATA[Potholes on <b>MG Road</b>]]></title>
        <link>https://thehindu.com/mg-road</link>
        <pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Missing a link, so unusable</title>
      </item>
    </channel></rss>
  `);

  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Garbage piles up in Ward 12 & 13 - Times of India");
  assert.equal(items[0].source, "Times of India");
  assert.equal(items[0].sourceUrl, "https://timesofindia.com");
  assert.equal(items[0].link, "https://timesofindia.com/city/ward-12");
  assert.equal(items[1].title, "Potholes on MG Road");
  assert.equal(items[1].source, null);
  assert.equal(items[1].sourceUrl, null);
});

test("decodeEntities handles named, decimal and hex references", () => {
  assert.equal(decodeEntities("BMC&rsquo;s drive"), "BMC’s drive");
  assert.equal(decodeEntities("a &#38; b"), "a & b");
  assert.equal(decodeEntities("a &#x26; b"), "a & b");
  assert.equal(decodeEntities("left &unknown; alone"), "left &unknown; alone");
});
