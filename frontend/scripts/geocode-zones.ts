/**
 * Resolves real coordinates for the Bengaluru institution list via Nominatim
 * and writes prisma/data/bangalore-zones.json.
 *
 *   npx tsx scripts/geocode-zones.ts
 *
 * Every result is bounds-checked against Greater Bengaluru before being
 * accepted. Anything that does not resolve, or resolves somewhere else, is
 * reported and left out rather than guessed at — a sensitive zone at the
 * wrong coordinates silently escalates the wrong reports.
 *
 * Re-running reuses coordinates already in the output file, so only the
 * unresolved entries hit the network.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  INSTITUTIONS,
  ZONE_DEFAULTS,
  type InstitutionSeed,
} from "../prisma/data/bangalore-institutions";

const OUTPUT = path.join(process.cwd(), "prisma", "data", "bangalore-zones.json");

// Nominatim asks for one request per second and a contactable User-Agent.
const DELAY_MS = 1200;
const USER_AGENT =
  process.env.GEOCODE_USER_AGENT ||
  "CivicBridge/0.1 (civic issue reporting; sensitive zone seeding)";

/** Greater Bengaluru, generously bounded. */
const BOUNDS = { minLat: 12.6, maxLat: 13.3, minLng: 77.3, maxLng: 77.95 };

export interface ResolvedZone {
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  weight: number;
  city: string;
  /** Kept so a human can audit what OSM actually matched. */
  matchedName: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "3");
  url.searchParams.set("countrycodes", "in");
  // Restrict to the Bengaluru box so a same-named institution in another
  // city cannot be picked up.
  url.searchParams.set(
    "viewbox",
    `${BOUNDS.minLng},${BOUNDS.maxLat},${BOUNDS.maxLng},${BOUNDS.minLat}`
  );
  url.searchParams.set("bounded", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
  });

  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  return (await response.json()) as NominatimHit[];
}

/**
 * Nominatim matches institution names far better than full postal-style
 * strings, so the locality-qualified query is only the first attempt. Each
 * fallback drops detail; all of them stay inside the Bengaluru viewbox.
 */
async function geocode(institution: InstitutionSeed): Promise<NominatimHit | null> {
  const bare = institution.name.replace(/,.*$/, "").trim();

  // A name like "National Public School, Koramangala" names one branch of a
  // chain. Dropping the locality would happily match a different campus
  // across the city, so branded branches never fall back to the bare name.
  const suffix = institution.name.includes(",")
    ? institution.name.split(",").pop()!.trim().toLowerCase()
    : "";
  const isBranch = suffix.length > 0 && suffix !== "bengaluru" && suffix !== "bangalore";

  const attempts = isBranch
    ? [institution.query, `${institution.name}, Bengaluru`]
    : [institution.query, `${institution.name}, Bengaluru`, `${bare}, Bengaluru`, bare];

  const seen = new Set<string>();

  for (const attempt of attempts) {
    if (seen.has(attempt)) continue;
    seen.add(attempt);

    const hits = await search(attempt);
    await sleep(DELAY_MS);

    const hit = hits.find((candidate) =>
      inBengaluru(Number(candidate.lat), Number(candidate.lon))
    );

    if (hit) return hit;
  }

  return null;
}

function inBengaluru(lat: number, lng: number): boolean {
  return (
    lat >= BOUNDS.minLat &&
    lat <= BOUNDS.maxLat &&
    lng >= BOUNDS.minLng &&
    lng <= BOUNDS.maxLng
  );
}

function loadExisting(): Map<string, ResolvedZone> {
  try {
    const raw = JSON.parse(readFileSync(OUTPUT, "utf8")) as ResolvedZone[];
    return new Map(raw.map((zone) => [zone.name, zone]));
  } catch {
    return new Map();
  }
}

async function main() {
  const resolved = loadExisting();
  const failed: Array<{ name: string; reason: string }> = [];

  console.log(
    `Geocoding ${INSTITUTIONS.length} institutions (${resolved.size} already cached)\n`
  );

  for (const [index, institution] of INSTITUTIONS.entries()) {
    const position = `[${index + 1}/${INSTITUTIONS.length}]`;

    if (resolved.has(institution.name)) {
      console.log(`${position} cached   ${institution.name}`);
      continue;
    }

    try {
      const hit = await geocode(institution);

      if (!hit) {
        failed.push({ name: institution.name, reason: "no match" });
        console.log(`${position} MISS     ${institution.name}`);
        continue;
      }

      const latitude = Number(hit.lat);
      const longitude = Number(hit.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        failed.push({ name: institution.name, reason: "unparseable coords" });
        console.log(`${position} BAD      ${institution.name}`);
        continue;
      }

      if (!inBengaluru(latitude, longitude)) {
        failed.push({
          name: institution.name,
          reason: `outside Bengaluru (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) → ${hit.display_name}`,
        });
        console.log(`${position} OUTSIDE  ${institution.name}`);
        continue;
      }

      const defaults = ZONE_DEFAULTS[institution.type];

      resolved.set(institution.name, {
        name: institution.name,
        type: institution.type,
        latitude,
        longitude,
        radiusMeters: defaults.radiusMeters,
        weight: defaults.weight,
        city: "Bengaluru",
        matchedName: hit.display_name,
      });

      console.log(
        `${position} ok       ${institution.name}  (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
      );
    } catch (error) {
      failed.push({
        name: institution.name,
        reason: error instanceof Error ? error.message : String(error),
      });
      console.log(`${position} ERROR    ${institution.name}`);
      await sleep(DELAY_MS);
    }
  }

  const zones = [...resolved.values()].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)
  );

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(zones, null, 2) + "\n", "utf8");

  const counts = zones.reduce<Record<string, number>>((acc, zone) => {
    acc[zone.type] = (acc[zone.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nResolved ${zones.length} of ${INSTITUTIONS.length}`);
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }

  if (failed.length > 0) {
    console.log(`\nUnresolved (${failed.length}) — not written:`);
    for (const entry of failed) console.log(`  ${entry.name} — ${entry.reason}`);
  }

  console.log(`\nWrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
