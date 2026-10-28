/**
 * Coordinates -> human address and ward name.
 *
 * Uses the free OpenStreetMap Nominatim endpoint. It is rate limited and
 * occasionally slow, so every call is timeboxed and every failure is
 * non-fatal: a report with no address is still a valid report.
 */

import { isValidCoordinate } from "./haversine";

export interface GeocodeResult {
  address: string | null;
  wardName: string | null;
  city: string | null;
  /** False when the lookup failed or was skipped — the caller may want to say so. */
  resolved: boolean;
}

const EMPTY: GeocodeResult = {
  address: null,
  wardName: null,
  city: null,
  resolved: false,
};

const TIMEOUT_MS = 6000;

// Nominatim asks for no more than one request per second, and repeat reports
// from the same street should not each cost a round trip.
const cache = new Map<string, GeocodeResult>();
const CACHE_LIMIT = 500;

function cacheKey(lat: number, lng: number) {
  // ~11m precision is plenty for an address lookup.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  residential?: string;
  quarter?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state_district?: string;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodeResult> {
  if (!isValidCoordinate(latitude, longitude)) return EMPTY;

  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached) return cached;

  if ((process.env.GEOCODE_PROVIDER ?? "nominatim") !== "nominatim") {
    return EMPTY;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim rejects requests without an identifying User-Agent.
        "User-Agent":
          process.env.GEOCODE_USER_AGENT ??
          "CivicBridge/0.1 (civic issue reporting)",
        Accept: "application/json",
      },
    });

    if (!response.ok) return EMPTY;

    const data = (await response.json()) as {
      display_name?: string;
      address?: NominatimAddress;
    };

    const addr = data.address ?? {};

    const result: GeocodeResult = {
      address: data.display_name ?? null,
      wardName:
        addr.suburb ??
        addr.neighbourhood ??
        addr.quarter ??
        addr.residential ??
        addr.city_district ??
        null,
      city: addr.city ?? addr.town ?? addr.municipality ?? null,
      resolved: true,
    };

    if (cache.size >= CACHE_LIMIT) {
      cache.delete(cache.keys().next().value as string);
    }
    cache.set(key, result);

    return result;
  } catch (error) {
    console.warn("Reverse geocode failed, continuing without address:", error);
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}
