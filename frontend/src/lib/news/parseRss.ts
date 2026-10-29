/**
 * Minimal RSS 2.0 item reader.
 *
 * Deliberately not a general XML parser. An <item> is a flat list of text
 * elements, which a few anchored patterns cover without pulling a dependency
 * in for one endpoint. Kept separate from the fetcher so it stays pure and
 * testable.
 */

export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  /** Google News carries the publisher here: <source url="...">Name</source>. */
  source: string | null;
  /**
   * The publisher's own site, from that same element's url attribute. Worth
   * reading because <link> on an aggregated feed points at the aggregator,
   * which tells a reader nothing about who reported the story.
   */
  sourceUrl: string | null;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];

  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];

    const title = tagText(block, "title");
    const link = tagText(block, "link");
    if (!title || !link) continue;

    items.push({
      title,
      link,
      pubDate: tagText(block, "pubDate"),
      source: tagText(block, "source"),
      sourceUrl: tagAttribute(block, "source", "url"),
    });
  }

  return items;
}

export function tagAttribute(
  block: string,
  name: string,
  attribute: string
): string | null {
  const match = block.match(
    new RegExp(`<${name}\\b[^>]*\\b${attribute}="([^"]*)"`, "i")
  );
  if (!match) return null;

  const value = decodeEntities(match[1]).trim();
  return value.length > 0 ? value : null;
}

export function tagText(block: string, name: string): string | null {
  const match = block.match(
    new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")
  );
  if (!match) return null;

  const text = decodeEntities(
    match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  )
    // Publishers put markup inside text nodes; the UI renders plain strings.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1]?.toLowerCase() === "x"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);

      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }

    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}
