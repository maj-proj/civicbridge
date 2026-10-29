/**
 * GET /api/news — civic issue headlines, read live from a news provider.
 *
 * Nothing is stored: this is a thin passthrough so the browser never has to
 * hold a provider key, and so the ticker and the news page read the same
 * feed. Provider responses are cached upstream in fetchCivicNews.
 *
 * Query parameters:
 *   topic   all | waste | roads | water | air | governance  (default: all)
 *   limit   1-60                                            (default: 24)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchCivicNews } from "@/lib/news/fetchCivicNews";
import { isNewsTopicId, NEWS_TOPIC_IDS } from "@/lib/news/topics";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const topicParam = params.get("topic");
  if (topicParam && !isNewsTopicId(topicParam)) {
    return NextResponse.json(
      {
        error: `Unknown topic '${topicParam}'. Expected one of: ${NEWS_TOPIC_IDS.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const limitRaw = Number(params.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const feed = await fetchCivicNews({
    topic: isNewsTopicId(topicParam) ? topicParam : undefined,
    limit,
  });

  return NextResponse.json(feed, {
    // A provider failure is reported in the body, not as a 5xx: the caller
    // still gets a well-formed feed and can render its empty state.
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
