/**
 * Counts prior reports at the same spot — a location that keeps being
 * dumped on is a different problem from a one-off, and the score says so.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { boundingBox, haversineMeters, isValidCoordinate } from "./haversine";

export const RECURRENCE_RADIUS_M = 50;
export const RECURRENCE_WINDOW_DAYS = 30;

export async function countRecentNearbyReports(
  latitude: number,
  longitude: number,
  options: { excludeReportId?: string } = {}
): Promise<number> {
  if (!isValidCoordinate(latitude, longitude)) return 0;
  if (!isDatabaseConfigured()) return 0;

  try {
    const box = boundingBox(latitude, longitude, RECURRENCE_RADIUS_M);
    const since = new Date(
      Date.now() - RECURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const candidates = await prisma.civicReport.findMany({
      where: {
        createdAt: { gte: since },
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        status: { notIn: ["REJECTED"] },
        ...(options.excludeReportId ? { id: { not: options.excludeReportId } } : {}),
      },
      select: { latitude: true, longitude: true },
    });

    // The bounding box is a square around a circle, so filter exactly.
    return candidates.filter(
      (report) =>
        report.latitude !== null &&
        report.longitude !== null &&
        haversineMeters(latitude, longitude, report.latitude, report.longitude) <=
          RECURRENCE_RADIUS_M
    ).length;
  } catch (error) {
    console.warn("Recurrence lookup failed, treating as first report:", error);
    return 0;
  }
}
