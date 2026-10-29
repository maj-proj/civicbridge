/**
 * POST /api/reports/pothole — the pothole track.
 *
 * Shares the whole pipeline with garbage (upload, geocoding, zone
 * sensitivity, recurrence, routing, notice) and differs only in which model
 * runs and how its output is scored.
 *
 * A road defect has no material composition, so categoryDistribution stays
 * empty and routing falls back to the ward office rather than being chosen
 * by dominant material.
 */

import { NextRequest } from "next/server";
import { submitIssueReport, type TrackOutcome } from "@/lib/reports/submitReport";
import { detectPothole } from "@/lib/vision/detectPothole";
import { computePotholePriority } from "@/lib/priority/computePotholePriority";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function analyse(file: File): Promise<TrackOutcome> {
  const detection = await detectPothole(file);

  if (!detection.ok) return { ok: false, error: detection.error };

  const { data } = detection;

  return {
    ok: true,
    analysis: {
      annotatedImageUrl: detection.annotatedImageUrl,
      raw: data,
      totalObjects: data.image_analysis.total_objects_detected,
      totalCategories: null,
      maxConfidence: data.detections.reduce(
        (max, row) => Math.max(max, row.confidence),
        0
      ),
      detections: data.detections,
      // No material composition on a road surface.
      categoryDistribution: [],
      dominantCategory: null,
      severityLevel: data.image_analysis.worst_severity_level ?? null,
      score: (context) => computePotholePriority(data, context),
    },
  };
}

export async function POST(req: NextRequest) {
  return submitIssueReport(req, {
    reportType: "POTHOLE",
    missingImageError: "A photograph of the road defect is required.",
    analyse,
    buildTitle({ totalObjects, wardName, locationText, severityLevel }) {
      const where = wardName || locationText || "an unspecified location";

      if (totalObjects === 0) return `Road defect report at ${where}`;

      const noun = totalObjects === 1 ? "pothole" : "potholes";
      const severity = severityLevel ? `${severityLevel.toLowerCase()}-severity ` : "";

      return `${totalObjects} ${severity}${noun} at ${where}`;
    },
  });
}
