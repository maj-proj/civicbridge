/**
 * POST /api/reports/garbage — the garbage track.
 *
 * The pipeline itself lives in lib/reports/submitReport so the pothole track
 * cannot drift away from it.
 */

import { NextRequest } from "next/server";
import { submitIssueReport } from "@/lib/reports/submitReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return submitIssueReport(req, {
    reportType: "GARBAGE",
    missingImageError: "A photograph of the waste is required.",
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
