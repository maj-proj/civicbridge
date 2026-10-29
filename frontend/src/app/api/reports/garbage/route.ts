/**
 * POST /api/reports/garbage — the garbage track.
 *
 * The pipeline itself lives in lib/reports/submitReport; this file supplies
 * only what is specific to waste: which model to run, how to score it, and
 * how to name the report.
 */

import { NextRequest } from "next/server";
import { submitIssueReport, type TrackOutcome } from "@/lib/reports/submitReport";
import { detectGarbage } from "@/lib/vision/detectGarbage";
import { computePriority } from "@/lib/priority/computePriority";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function analyse(file: File): Promise<TrackOutcome> {
  const detection = await detectGarbage(file);

  if (!detection.ok) return { ok: false, error: detection.error };

  const { data } = detection;
  const distribution = data.category_distribution ?? [];

  const dominantCategory =
    [...distribution].sort((a, b) => b.percentage - a.percentage)[0]
      ?.category ?? null;

  return {
    ok: true,
    analysis: {
      annotatedImageUrl: detection.annotatedImageUrl,
      raw: data,
      totalObjects: data.image_analysis.total_objects_detected,
      totalCategories: data.image_analysis.total_categories_detected,
      maxConfidence: data.detections.reduce(
        (max, row) => Math.max(max, row.confidence),
        0
      ),
      detections: data.detections,
      categoryDistribution: distribution,
      dominantCategory,
      severityLevel: null,
      score: (context) => computePriority(data, context),
    },
  };
}

export async function POST(req: NextRequest) {
  return submitIssueReport(req, {
    reportType: "GARBAGE",
    missingImageError: "A photograph of the waste is required.",
    analyse,
    buildTitle({ totalObjects, dominantCategory, wardName, locationText }) {
      const where = wardName || locationText || "an unspecified location";
      if (totalObjects === 0) return `Waste report at ${where}`;
      const what = dominantCategory
        ? `${dominantCategory.toLowerCase()} waste`
        : "waste";
      const item = totalObjects === 1 ? "item" : "items";
      return `${totalObjects} ${item} of ${what} at ${where}`;
    },
  });
}
