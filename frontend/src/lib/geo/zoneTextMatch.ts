/**
 * Recognises a sensitive place named in the reporter's own words.
 *
 * Coordinates are the primary signal and always win. This is the fallback for
 * "dumped right outside JSS college" typed into the landmark box with no GPS
 * fix — a claim rather than a measurement, so every match it produces is
 * discounted (MENTION_CONFIDENCE) and labelled as a mention downstream.
 *
 * Matching has to cope with how people actually write institution names:
 * "JSSATE", "JSS Bangalore", "RVCE", "RV College", "RVC" — so each zone is
 * indexed by its full name, its acronym, a short form, and whichever of its
 * words are rare enough to identify it on their own.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { MENTION_CONFIDENCE, NEUTRAL_ZONE_MULTIPLIER } from "@/lib/priority/weights";

export interface ZoneMention {
  name: string;
  type: string;
  /** Zone weight after the mention discount. */
  multiplier: number;
  /** Raw zone weight, before discounting. */
  zoneWeight: number;
  confidence: "strong" | "weak";
  /** The text that triggered it, for the audit trail. */
  matchedOn: string;
}

interface ZoneRow {
  name: string;
  type: string;
  weight: number;
}

interface ZoneMatcher {
  zone: ZoneRow;
  normalised: string;
  acronym: string;
  shortForm: string;
  distinctive: string[];
  locality: string | null;
}

/**
 * Words that appear in dozens of institution names and so identify nothing.
 * "National Public School" is entirely generic — only its locality or its
 * acronym can tell one branch from another.
 */
const GENERIC = new Set([
  "the", "of", "and", "for", "a", "an", "at", "in", "near", "beside", "opposite",
  "college", "school", "hospital", "institute", "institution", "university",
  "academy", "campus", "centre", "center", "clinic", "nursing", "home",
  "technology", "technical", "education", "engineering", "science", "sciences",
  "management", "studies", "medical", "memorial", "multispeciality",
  "speciality", "specialty", "international", "public", "national", "global",
  "high", "higher", "primary", "secondary", "children", "child", "women",
  "girls", "boys", "pre", "university", "degree", "polytechnic",
  "bengaluru", "bangalore", "karnataka", "india", "road", "layout", "nagar",
  "stage", "block", "main", "cross", "sector", "phase", "new", "old",
  "dr", "sri", "shri", "st", "saint", "smt", "late",
]);

/** Words that say what kind of place it is, used to shore up 2-letter hits. */
const KIND_WORDS: Record<string, string[]> = {
  COLLEGE: ["college", "university", "institute", "campus", "engineering"],
  SCHOOL: ["school", "academy", "vidyalaya"],
  HOSPITAL: ["hospital", "clinic", "nursing", "medical", "healthcare"],
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { matchers: ZoneMatcher[]; loadedAt: number } | null = null;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * "JSS Academy of Technical Education" -> "jssate"
 * "R V College of Engineering"         -> "rvce"
 * "BMS College of Engineering"         -> "bmsce"
 *
 * An already-capitalised token such as JSS or BMS contributes whole; ordinary
 * words contribute their initial. That is how these acronyms are actually
 * formed in practice.
 */
function buildAcronym(rawName: string): string {
  const head = rawName.split(",")[0];
  const words = head.split(/[^A-Za-z0-9]+/).filter(Boolean);

  let acronym = "";
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower === "of" || lower === "and" || lower === "the" || lower === "for") {
      continue;
    }
    acronym +=
      word.length <= 5 && word === word.toUpperCase()
        ? lower
        : lower[0];
  }
  return acronym;
}

/** The leading capitalised run: "JSS", "RV", "BMS", "PES". */
function buildShortForm(rawName: string): string {
  const head = rawName.split(",")[0];
  const words = head.split(/[^A-Za-z0-9]+/).filter(Boolean);

  let short = "";
  for (const word of words) {
    if (word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
      short += word.toLowerCase();
    } else {
      break;
    }
  }
  return short;
}

function buildMatcher(zone: ZoneRow): ZoneMatcher {
  const [head, ...rest] = zone.name.split(",");
  const normalised = normalise(zone.name);
  const localityRaw = rest.join(" ").trim();
  const locality = localityRaw ? normalise(localityRaw) : null;

  const distinctive = normalise(head)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC.has(token));

  return {
    zone,
    normalised,
    acronym: buildAcronym(zone.name),
    shortForm: buildShortForm(zone.name),
    distinctive,
    locality: locality && !GENERIC.has(locality) ? locality : null,
  };
}

async function loadMatchers(): Promise<ZoneMatcher[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.matchers;
  if (!isDatabaseConfigured()) return [];

  try {
    const zones = await prisma.sensitiveZone.findMany({
      select: { name: true, type: true, weight: true },
    });

    const matchers = zones.map((zone) =>
      buildMatcher({ name: zone.name, type: zone.type, weight: zone.weight })
    );

    cache = { matchers, loadedAt: Date.now() };
    return matchers;
  } catch (error) {
    console.error("Could not load zones for text matching:", error);
    return [];
  }
}

/** Only for tests — drops the in-process cache. */
export function resetZoneMatchCache() {
  cache = null;
}

function hasWord(haystackTokens: Set<string>, needle: string): boolean {
  return haystackTokens.has(needle);
}

interface Scored {
  matcher: ZoneMatcher;
  score: number;
  matchedOn: string;
}

/** Pure scorer, exported so the matching rules can be tested without a DB. */
export function scoreZoneMatch(
  text: string,
  matcher: ZoneMatcher
): Scored | null {
  const normalisedText = normalise(text);
  if (!normalisedText) return null;

  const tokens = new Set(normalisedText.split(" "));
  const kindWords = KIND_WORDS[matcher.zone.type] ?? [];
  const mentionsKind = kindWords.some((word) => tokens.has(word));

  let score = 0;
  let matchedOn = "";

  // Whole name written out.
  if (matcher.normalised.length > 0 && normalisedText.includes(matcher.normalised)) {
    score = 100;
    matchedOn = matcher.zone.name;
  }

  // A real acronym: "jssate", "rvce", "msrit", "nps".
  if (score < 90 && matcher.acronym.length >= 3) {
    if (hasWord(tokens, matcher.acronym)) {
      // Three letters is shared by whole chains ("NPS", "DPS"), so on its own
      // it only earns a weak match; naming the branch pushes it over.
      score = matcher.acronym.length >= 4 ? 90 : 78;
      matchedOn = matcher.acronym.toUpperCase();
    } else if (matcher.acronym.length >= 4) {
      // "RVC" for RVCE — a truncation people genuinely write.
      const truncation = [...tokens].find(
        (token) =>
          token.length >= 3 &&
          token.length < matcher.acronym.length &&
          matcher.acronym.startsWith(token)
      );
      if (truncation) {
        score = 80;
        matchedOn = truncation.toUpperCase();
      }
    }
  }

  // Short form: "jss", "rv", "bms".
  if (score < 80 && matcher.shortForm.length >= 3 && hasWord(tokens, matcher.shortForm)) {
    score = 80;
    matchedOn = matcher.shortForm.toUpperCase();
  }

  // Two letters is too thin on its own; require the kind of place as support.
  if (
    score < 70 &&
    matcher.shortForm.length === 2 &&
    hasWord(tokens, matcher.shortForm) &&
    mentionsKind
  ) {
    score = 70;
    matchedOn = matcher.shortForm.toUpperCase();
  }

  // Distinctive words — "dayananda sagar", "narayana", "victoria".
  const hits = matcher.distinctive.filter((token) => hasWord(tokens, token));
  if (hits.length >= 2) {
    score = Math.max(score, 85);
    matchedOn = matchedOn || hits.join(" ");
  } else if (hits.length === 1 && hits[0].length >= 5) {
    score = Math.max(score, mentionsKind ? 75 : 68);
    matchedOn = matchedOn || hits[0];
  }

  if (score === 0) return null;

  // Naming the branch as well removes the ambiguity between campuses.
  if (matcher.locality && normalisedText.includes(matcher.locality)) {
    score += 10;
  }

  return { matcher, score, matchedOn };
}

/**
 * Finds the sensitive place a reporter named in free text, if any.
 * Returns null when nothing is recognised with enough confidence.
 */
export async function matchZoneMention(
  text: string | null | undefined
): Promise<ZoneMention | null> {
  if (!text || text.trim().length < 3) return null;

  const matchers = await loadMatchers();
  if (matchers.length === 0) return null;

  const scored = matchers
    .map((matcher) => scoreZoneMatch(text, matcher))
    .filter((entry): entry is Scored => entry !== null)
    .sort((a, b) =>
      b.score === a.score ? b.matcher.zone.weight - a.matcher.zone.weight : b.score - a.score
    );

  const best = scored[0];
  if (!best || best.score < 68) return null;

  const confidence: ZoneMention["confidence"] = best.score >= 80 ? "strong" : "weak";
  const factor = MENTION_CONFIDENCE[confidence];
  const zoneWeight = best.matcher.zone.weight;

  return {
    name: best.matcher.zone.name,
    type: best.matcher.zone.type,
    zoneWeight,
    multiplier:
      NEUTRAL_ZONE_MULTIPLIER + (zoneWeight - NEUTRAL_ZONE_MULTIPLIER) * factor,
    confidence,
    matchedOn: best.matchedOn,
  };
}
