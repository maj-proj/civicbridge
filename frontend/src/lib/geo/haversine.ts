/** Great-circle distance helpers. Pure, no I/O. */

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance between two WGS84 points, in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A latitude/longitude box that fully contains the circle of `radiusMeters`
 * around a point. Used to narrow a database query before measuring exact
 * distances in JS — an index-friendly prefilter, not the final answer.
 */
export function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);

  // Longitude degrees shrink towards the poles. Guard against cos -> 0.
  const cosLat = Math.max(Math.cos(toRadians(lat)), 1e-6);
  const lngDelta = latDelta / cosLat;

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // 0,0 is in the Gulf of Guinea — almost always an uninitialised value.
    !(lat === 0 && lng === 0)
  );
}
