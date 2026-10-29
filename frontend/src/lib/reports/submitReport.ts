/**
 * The shared submission pipeline behind both report tracks.
 *
 *   validate -> store image -> detect -> geocode + sensitivity + recurrence
 *            -> score -> persist. The notice is drafted and sent separately,
 *            after the reporter approves it.
 *
 * Garbage and pothole reports differ only in their labelling and in which
 * detection model should eventually serve them, so they share this handler
 * rather than drifting into two copies.
 *
 * Degradation is the design priority here: a citizen's report is never lost
 * because the model container restarted or a geocoder timed out. Anything
 * that fails is recorded on the report and the submission still succeeds.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { ensurePublicOverlay } from "@/lib/reports/publicOverlay";
import {
  clientIdentifier,
  pruneRateLimitWindows,
  rateLimit,
} from "@/lib/rateLimit";
import { uploadEvidenceImage } from "@/lib/storage/uploadImage";
import { reverseGeocode } from "@/lib/geo/reverseGeocode";
import { resolveZoneSensitivity } from "@/lib/geo/zoneSensitivity";
import { countRecentNearbyReports } from "@/lib/geo/recurrence";
import { isValidCoordinate } from "@/lib/geo/haversine";
import { matchZoneMention } from "@/lib/geo/zoneTextMatch";
import { PRIORITY_LABEL_TEXT } from "@/lib/priority/computePriority";
import type {
  PriorityContext,
  PriorityResult,
} from "@/lib/priority/computePriority";
import type { Prisma } from "@prisma/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export interface TitleInput {
  totalObjects: number;
  dominantCategory: string | null;
  wardName: string | null;
  locationText: string | null;
  /** Worst severity level, on tracks that measure one. */
  severityLevel?: string | null;
}

/**
 * What a track's detector hands back once it has run and scored.
 *
 * Garbage and pothole detect different things and score them differently,
 * so each track supplies this rather than the pipeline branching on type.
 * Everything downstream — geocoding, zone sensitivity, recurrence, routing,
 * the notice — is identical for both.
 */
export interface TrackAnalysis {
  /** Served by the detection service; mirrored to object storage later. */
  annotatedImageUrl: string | null;
  /** Echoed to the client verbatim. */
  raw: unknown;
  totalObjects: number;
  totalCategories: number | null;
  maxConfidence: number | null;
  /** Stored on CivicReport.detections. */
  detections: unknown;
  /** Stored on CivicReport.categoryDistribution; empty on tracks without one. */
  categoryDistribution: unknown;
  /** Drives routing and the title on tracks that classify material. */
  dominantCategory: string | null;
  /** Worst severity level, on tracks that measure one. */
  severityLevel: string | null;
  score(context: PriorityContext): PriorityResult;
}

export type TrackOutcome =
  | { ok: true; analysis: TrackAnalysis }
  | { ok: false; error: string };

export interface IssueReportConfig {
  /** Persisted on CivicReport.type. */
  reportType: "GARBAGE" | "POTHOLE";
  /** 400 message when no photograph is attached. */
  missingImageError: string;
  buildTitle(input: TitleInput): string;
  /** Runs this track's model and returns its scorer. */
  analyse(file: File): Promise<TrackOutcome>;
  /**
   * Added to every submission's warnings while this track has no trained
   * model of its own. The result panel surfaces it, so a citizen is never
   * shown a score the vision model could not actually have produced.
   */
  modelCaveat?: string;
}

function parseCoordinate(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSession(req: NextRequest): { id: string; username?: string } | null {
  const cookie = req.cookies.get("civic_anon_session");
  if (!cookie?.value) return null;
  try {
    return JSON.parse(cookie.value);
  } catch {
    return null;
  }
}

export async function submitIssueReport(
  req: NextRequest,
  config: IssueReportConfig
) {
  pruneRateLimitWindows();

  const session = readSession(req);
  const limiterKey = session?.id ?? clientIdentifier(req);
  const limit = rateLimit(limiterKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many reports submitted. Please wait before trying again.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  // --- parse and validate --------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data submission." },
      { status: 400 }
    );
  }

  const file = form.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: config.missingImageError }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type "${file.type}". Use JPG, PNG or WebP.` },
      { status: 415 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Image exceeds the 10MB limit." },
      { status: 413 }
    );
  }

  const latitude = parseCoordinate(form.get("latitude"));
  const longitude = parseCoordinate(form.get("longitude"));
  const hasCoords = isValidCoordinate(latitude, longitude);

  const description = (form.get("description") as string | null)?.trim() || null;
  const wasteType = (form.get("wasteType") as string | null)?.trim() || null;
  const locationText = (form.get("locationText") as string | null)?.trim() || null;

  const warnings: string[] = [];

  if (config.modelCaveat) warnings.push(config.modelCaveat);

  if (!hasCoords) {
    warnings.push(
      "No coordinates were provided, so zone sensitivity and authority " +
        "routing could not be applied to this report."
    );
  }

  // --- store the evidence --------------------------------------------------
  let imageUrl: string | null = null;
  try {
    const stored = await uploadEvidenceImage(file);
    imageUrl = stored.url;
    if (stored.provider === "local") {
      warnings.push(
        "Image stored on local disk — configure Cloudinary before deploying."
      );
    }
  } catch (error) {
    console.error("Evidence upload failed:", error);
    warnings.push("The photograph could not be stored, but the report was kept.");
  }

  // --- detection (whichever model this track uses) -------------------------
  const detection = await config.analyse(file);

  if (!detection.ok) {
    warnings.push(
      `Detection service unavailable (${detection.error}). The report was saved ` +
        "without a priority score and is queued for re-analysis."
    );
  }

  const analysis = detection.ok ? detection.analysis : null;

  // --- location context (independent lookups, run together) ----------------
  const [geo, coordinateSensitivity, recurrenceCount] = hasCoords
    ? await Promise.all([
        reverseGeocode(latitude as number, longitude as number),
        resolveZoneSensitivity(latitude as number, longitude as number),
        countRecentNearbyReports(latitude as number, longitude as number),
      ])
    : [
        { address: null, wardName: null, city: null, resolved: false },
        { multiplier: 1, triggeringPoi: null, nearbyPois: [], resolved: false },
        0,
      ];

  if (hasCoords && !geo.resolved) {
    warnings.push("Address lookup failed; the report has coordinates only.");
  }

  // Coordinates are evidence and always win. Only when they produced no zone
  // — usually because none were supplied — do we fall back to whatever
  // sensitive place the reporter named in their own words, at a discount.
  let sensitivity = coordinateSensitivity;

  if (sensitivity.multiplier <= 1) {
    const mention = await matchZoneMention(
      [locationText, description].filter(Boolean).join(" ")
    );

    if (mention) {
      sensitivity = {
        ...sensitivity,
        multiplier: mention.multiplier,
        triggeringPoi: {
          name: mention.name,
          type: mention.type,
          distanceMeters: null,
          weight: mention.zoneWeight,
          source: "mention",
        },
      };

      warnings.push(
        `Priority raised because "${mention.matchedOn}" was named in the ` +
          `report text. This is not a verified location — add coordinates ` +
          `for a measured assessment.`
      );
    }
  }

  // --- score (each track scores what its own model measured) ---------------
  const priority = analysis
    ? analysis.score({
        zoneMultiplier: sensitivity.multiplier,
        triggeringPoi: sensitivity.triggeringPoi,
        recurrenceCount,
      })
    : null;

  const dominantCategory = analysis?.dominantCategory ?? null;
  const maxConfidence = analysis?.maxConfidence ?? null;

  const title = config.buildTitle({
    totalObjects: analysis?.totalObjects ?? 0,
    dominantCategory,
    wardName: geo.wardName,
    locationText,
    severityLevel: analysis?.severityLevel ?? null,
  });

  // --- respond without persisting when there is no database ----------------
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      success: true,
      persisted: false,
      warnings: [
        ...warnings,
        "DATABASE_URL is not configured, so this report was analysed but not saved.",
      ],
      report: {
        id: null,
        type: config.reportType,
        title,
        status: "SUBMITTED",
        imageUrl,
        annotatedImageUrl: analysis?.annotatedImageUrl ?? null,
        address: geo.address,
        wardName: geo.wardName,
        latitude,
        longitude,
      },
      analysis: analysis?.raw ?? null,
      priority: priority
        ? {
            score: priority.score,
            label: priority.label,
            labelText: PRIORITY_LABEL_TEXT[priority.label],
            breakdown: priority.breakdown,
          }
        : null,
      sensitivity,
      recurrenceCount,
    });
  }

  // --- persist -------------------------------------------------------------
  try {
    const created = await prisma.civicReport.create({
      data: {
        type: config.reportType,
        title,
        description,
        anonymousId: session?.id ?? null,

        imageUrl,
        annotatedImageUrl: analysis?.annotatedImageUrl ?? null,

        latitude,
        longitude,
        address: geo.address ?? locationText,
        wardName: geo.wardName,
        city: geo.city,

        // Holds the reporter's own classification for either track.
        wasteType: wasteType ?? dominantCategory,
        detections: (analysis?.detections ?? []) as Prisma.InputJsonValue,
        categoryDistribution: (analysis?.categoryDistribution ??
          []) as Prisma.InputJsonValue,
        totalObjects: analysis?.totalObjects ?? null,
        totalCategories: analysis?.totalCategories ?? null,
        maxConfidence,

        priorityScore: priority?.score ?? null,
        priorityLabel: priority?.label ?? null,
        scoreBreakdown: (priority?.breakdown ??
          null) as unknown as Prisma.InputJsonValue,
        zoneMultiplier: sensitivity.multiplier,
        nearbyPois: sensitivity.nearbyPois as unknown as Prisma.InputJsonValue,
        recurrenceCount,

        status: priority ? "VERIFIED" : "SUBMITTED",
      },
    });

    await prisma.reportStatusEvent.create({
      data: {
        reportId: created.id,
        fromStatus: null,
        toStatus: created.status,
        actor: session?.id ?? "anonymous",
        note: priority
          ? `Scored ${priority.score}/100 (${PRIORITY_LABEL_TEXT[priority.label]}).`
          : "Saved without a score; detection service was unavailable.",
      },
    });

    // No automatic dispatch. The reporter reviews the drafted notice and
    // approves it before anything is sent — see /api/reports/[id]/email.

    // The overlay is served from the detection service's own host, so it is
    // mirrored to Cloudinary for everyone who is not this machine. Done after
    // the response because it is a multi-megabyte round trip the reporter
    // should not wait on, and the draft step re-checks it anyway.
    if (created.annotatedImageUrl) {
      after(async () => {
        try {
          await ensurePublicOverlay(created);
        } catch (error) {
          console.error("Overlay mirroring failed:", error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      persisted: true,
      warnings,
      report: {
        id: created.id,
        type: created.type,
        title: created.title,
        status: created.status,
        imageUrl: created.imageUrl,
        annotatedImageUrl: created.annotatedImageUrl,
        address: created.address,
        wardName: created.wardName,
        latitude: created.latitude,
        longitude: created.longitude,
        createdAt: created.createdAt,
      },
      analysis: analysis?.raw ?? null,
      priority: priority
        ? {
            score: priority.score,
            label: priority.label,
            labelText: PRIORITY_LABEL_TEXT[priority.label],
            breakdown: priority.breakdown,
          }
        : null,
      sensitivity,
      recurrenceCount,
    });
  } catch (error) {
    console.error("Failed to persist report:", error);
    return NextResponse.json(
      {
        error:
          "The report was analysed but could not be saved. Run 'npx prisma migrate dev' " +
          "if the schema has not been applied yet.",
        detail: error instanceof Error ? error.message : String(error),
        analysis: analysis?.raw ?? null,
      },
      { status: 500 }
    );
  }
}
