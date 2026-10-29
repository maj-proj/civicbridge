/**
 * Resolves how sensitive a location is, from the seeded SensitiveZone table.
 *
 * A zone's weight applies in full inside its radius, then decays linearly to
 * neutral over the same distance again — so a hospital 100m away escalates
 * hard, one 2km away does not escalate at all. The strongest *effective*
 * weight wins, not merely the nearest zone.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { boundingBox, haversineMeters, isValidCoordinate } from "./haversine";
import { NEUTRAL_ZONE_MULTIPLIER } from "@/lib/priority/weights";
import type { TriggeringPoi } from "@/lib/priority/computePriority";

export interface NearbyPoi {
  name: string;
  type: string;
  distanceMeters: number;
  /** Weight after distance decay. */
  effectiveWeight: number;
}

export interface SensitivityResult {
  multiplier: number;
  triggeringPoi: TriggeringPoi | null;
  nearbyPois: NearbyPoi[];
  /** False when the DB was unavailable — the score falls back to neutral. */
  resolved: boolean;
}

const NEUTRAL: SensitivityResult = {
  multiplier: NEUTRAL_ZONE_MULTIPLIER,
  triggeringPoi: null,
  nearbyPois: [],
  resolved: false,
};

/** How far past its own radius a zone still has any influence. */
const DECAY_FACTOR = 2;

/** Hard cap on the search box, so a bad coordinate cannot scan the table. */
const MAX_SEARCH_RADIUS_M = 3000;

function decayedWeight(
  weight: number,
  distanceMeters: number,
  radiusMeters: number
): number {
  if (distanceMeters <= radiusMeters) return weight;

  const falloffEnd = radiusMeters * DECAY_FACTOR;
  if (distanceMeters >= falloffEnd) return NEUTRAL_ZONE_MULTIPLIER;

  const remaining = 1 - (distanceMeters - radiusMeters) / (falloffEnd - radiusMeters);
  return NEUTRAL_ZONE_MULTIPLIER + (weight - NEUTRAL_ZONE_MULTIPLIER) * remaining;
}

export async function resolveZoneSensitivity(
  latitude: number,
  longitude: number
): Promise<SensitivityResult> {
  if (!isValidCoordinate(latitude, longitude)) return NEUTRAL;
  if (!isDatabaseConfigured()) return NEUTRAL;

  try {
    const box = boundingBox(latitude, longitude, MAX_SEARCH_RADIUS_M);

    const candidates = await prisma.sensitiveZone.findMany({
      where: {
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
    });

    const scored: Array<NearbyPoi & { raw: (typeof candidates)[number] }> = [];

    for (const zone of candidates) {
      const distance = haversineMeters(
        latitude,
        longitude,
        zone.latitude,
        zone.longitude
      );

      const effective = decayedWeight(zone.weight, distance, zone.radiusMeters);

      if (effective > NEUTRAL_ZONE_MULTIPLIER) {
        scored.push({
          name: zone.name,
          type: zone.type,
          distanceMeters: Math.round(distance),
          effectiveWeight: Number(effective.toFixed(3)),
          raw: zone,
        });
      }
    }

    if (scored.length === 0) {
      return { ...NEUTRAL, resolved: true };
    }

    // Strongest influence wins; ties break towards the closer facility.
    scored.sort(
      (a, b) =>
        b.effectiveWeight - a.effectiveWeight || a.distanceMeters - b.distanceMeters
    );

    const top = scored[0];

    return {
      multiplier: top.effectiveWeight,
      triggeringPoi: {
        name: top.name,
        type: top.type,
        distanceMeters: top.distanceMeters,
        weight: top.raw.weight,
      },
      nearbyPois: scored
        .slice(0, 5)
        .map(({ name, type, distanceMeters, effectiveWeight }) => ({
          name,
          type,
          distanceMeters,
          effectiveWeight,
        })),
      resolved: true,
    };
  } catch (error) {
    console.warn("Zone sensitivity lookup failed, scoring as neutral:", error);
    return NEUTRAL;
  }
}
