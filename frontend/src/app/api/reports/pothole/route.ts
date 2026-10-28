/**
 * POST /api/reports/pothole — the pothole track.
 *
 * Shares the garbage pipeline (upload, geocode, zone sensitivity, recurrence,
 * scoring, routing, email) so that the only thing still missing is a trained
 * pothole model.
 *
 * Until that model exists, `detectGarbage` serves this route and returns waste
 * classes, so a pothole photograph yields no meaningful detections. The title
 * therefore never claims a count, and modelCaveat puts the limitation in front
 * of the reporter instead of presenting an empty analysis as a real result.
 */

import { NextRequest } from "next/server";
import { submitIssueReport } from "@/lib/reports/submitReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return submitIssueReport(req, {
    reportType: "POTHOLE",
    missingImageError: "A photograph of the road defect is required.",
    buildTitle({ wardName, locationText }) {
      const where = wardName || locationText || "an unspecified location";
      return `Pothole report at ${where}`;
    },
    modelCaveat:
      "No pothole detection model is trained yet, so this photograph was " +
      "analysed by the waste model. Any score shown is not a measurement of " +
      "the road defect and the report needs manual review.",
  });
}
