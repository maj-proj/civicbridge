/**
 * The civic beats the news feature covers.
 *
 * Each topic is a saved search rather than a category the provider knows
 * about: no free news API exposes "potholes in Indian cities" as a section,
 * so the beat is expressed as a query and the provider is asked for it.
 * Shared by the server fetcher and the client-visible filter, so this file
 * stays free of anything server-only.
 */

export const NEWS_TOPIC_IDS = [
  "all",
  "waste",
  "roads",
  "water",
  "air",
  "governance",
] as const;

export type NewsTopicId = (typeof NEWS_TOPIC_IDS)[number];

export interface NewsTopic {
  id: NewsTopicId;
  label: string;
  /** Shown under the page heading when the topic is active. */
  description: string;
  /** Boolean search passed to whichever provider is configured. */
  query: string;
  /** How far back the topic is worth reading. Narrow beats need a wider window. */
  days: number;
}

export const NEWS_TOPICS: NewsTopic[] = [
  {
    id: "all",
    label: "All civic news",
    description:
      "Everything on the civic beat — sanitation, roads, drainage, air and the bodies responsible for them.",
    query:
      '"municipal corporation" OR "civic body" OR garbage OR pothole OR sewage OR waterlogging OR encroachment',
    days: 7,
  },
  {
    id: "waste",
    label: "Garbage & sanitation",
    description:
      "Solid waste collection, dumping grounds, landfills and sanitation drives.",
    query:
      'garbage OR "solid waste" OR landfill OR dumping OR sanitation OR swachh',
    days: 14,
  },
  {
    id: "roads",
    label: "Roads & potholes",
    description:
      "Potholes, road resurfacing, cave-ins and the contracts behind them.",
    query:
      'pothole OR "road repair" OR "road caving" OR "bad roads" OR resurfacing',
    days: 14,
  },
  {
    id: "water",
    label: "Water & drainage",
    description:
      "Waterlogging, sewage overflow, stormwater drains and water supply.",
    query:
      'waterlogging OR sewage OR "storm water drain" OR drainage OR "water supply"',
    days: 14,
  },
  {
    id: "air",
    label: "Air quality",
    description: "Air pollution, AQI readings and the measures taken against them.",
    query: '"air pollution" OR AQI OR smog OR "air quality index"',
    days: 7,
  },
  {
    id: "governance",
    label: "Civic governance",
    description:
      "Municipal budgets, ward committees, grievance redressal and urban local bodies.",
    query:
      '"municipal corporation" OR "urban local body" OR "ward committee" OR "civic grievance"',
    days: 14,
  },
];

const BY_ID = new Map(NEWS_TOPICS.map((topic) => [topic.id, topic]));

export function isNewsTopicId(value: unknown): value is NewsTopicId {
  return typeof value === "string" && BY_ID.has(value as NewsTopicId);
}

/** Falls back to "all" so a hand-edited URL can never 404 the page. */
export function resolveTopic(value: unknown): NewsTopic {
  return (isNewsTopicId(value) ? BY_ID.get(value) : BY_ID.get("all"))!;
}
