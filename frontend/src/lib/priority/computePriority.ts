/**
 * The priority engine.
 *
 * Pure: no database, no fetch, no clock, no environment. Everything it needs
 * arrives as arguments, which is what makes it unit-testable and what lets
 * the thresholds be pinned by tests.
 *
 *   base     = 0.50*volume + 0.35*hazard + 0.15*mix
 *   adjusted = base x confidenceFactor x zoneMultiplier + recurrenceBonus
 *   score    = clamp(adjusted, 0, 100)
 *
 * Every run returns a breakdown explaining itself — the report card and the
 * authority email both render it, so a score is never a bare number.
 */

import type { PredictResponse } from "@/lib/types/detection";
import {
  AREA_RATIO_FULL_SCORE,
  CONFIDENCE_FLOOR,
  CONFIDENCE_REFERENCE,
  CRITICAL_CATEGORIES,
  CRITICAL_CATEGORY_SCORE_FLOOR,
  HAZARD_BASELINE_WEIGHT,
  MIX_SATURATION_CATEGORIES,
  NEUTRAL_ZONE_MULTIPLIER,
  PRIORITY_BANDS,
  RECURRENCE_BONUS_CAP,
  RECURRENCE_BONUS_PER_REPORT,
  SUBSCORE_WEIGHTS,
  VOLUME_BLEND,
  VOLUME_SATURATION_K,
  ZONE_ESCALATION_GAIN,
  ZONE_MULTIPLIER_MAX,
  categoryWeight,
} from "./weights";

export type PriorityLabel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface TriggeringPoi {
  name: string;
  type: string;
  /** Null when the place was named in the report text rather than measured. */
  distanceMeters: number | null;
  weight: number;
  /**
   * How we know the site is near this place. "coordinates" is a measured
   * distance; "mention" is the reporter's own words and carries a reduced
   * multiplier. The distinction is surfaced in the breakdown and the notice,
   * so nobody mistakes a claim for a measurement.
   */
  source?: "coordinates" | "mention";
}

/**
 * Phrases the zone trigger without ever implying a measurement we do not
 * have. A mention says who named it and on what, so a reader can weigh it.
 */
function describePoiProximity(poi: TriggeringPoi): string {
  if (poi.source === "mention" || poi.distanceMeters == null) {
    return `${poi.name} named in the report text (not location-verified)`;
  }
  return `${Math.round(poi.distanceMeters)}m from ${poi.name}`;
}

export interface PriorityContext {
  /** 1.0 when no sensitive zone is nearby. */
  zoneMultiplier: number;
  triggeringPoi?: TriggeringPoi | null;
  /** Prior reports within the recurrence radius and window. */
  recurrenceCount: number;
}

export interface BreakdownFactor {
  key: string;
  label: string;
  /** The factor's contribution, on whatever scale the factor uses. */
  value: number;
  /** One line a human can read. Used verbatim in the authority email. */
  detail: string;
}

export interface ScoreBreakdown {
  volumeScore: number;
  hazardScore: number;
  mixScore: number;
  baseScore: number;
  confidenceFactor: number;
  zoneMultiplier: number;
  /** Points added by zone sensitivity, drawn from the remaining headroom. */
  zoneBoost: number;
  recurrenceBonus: number;
  criticalFloorApplied: boolean;
  /** Which signals volume was computed from. */
  volumeBasis: "area+count" | "count";
  factors: BreakdownFactor[];
  /** Plain-language lines, highest-impact first. */
  summary: string[];
}

export interface PriorityResult {
  score: number;
  label: PriorityLabel;
  breakdown: ScoreBreakdown;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Maps a 0–100 score onto the four public-facing bands. */
export function scoreToLabel(score: number): PriorityLabel {
  if (score >= PRIORITY_BANDS.VERY_HIGH.min) return "VERY_HIGH";
  if (score >= PRIORITY_BANDS.HIGH.min) return "HIGH";
  if (score >= PRIORITY_BANDS.MEDIUM.min) return "MEDIUM";
  return "LOW";
}

export const PRIORITY_LABEL_TEXT: Record<PriorityLabel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very High",
};

/**
 * Saturating volume curve. 1 - e^(-n/k): steep at first, flattening out,
 * because the difference between 2 and 12 objects matters far more than
 * the difference between 120 and 130.
 */
function volumeFromCount(objectCount: number): number {
  if (objectCount <= 0) return 0;
  return 100 * (1 - Math.exp(-objectCount / VOLUME_SATURATION_K));
}

/** Linear up to AREA_RATIO_FULL_SCORE, then capped. */
function volumeFromArea(areaRatio: number): number {
  return clamp((areaRatio / AREA_RATIO_FULL_SCORE) * 100, 0, 100);
}

export function computePriority(
  analysis: PredictResponse,
  context: PriorityContext
): PriorityResult {
  const { image_analysis, detections, category_distribution } = analysis;

  const objectCount = Math.max(0, image_analysis.total_objects_detected ?? 0);
  const categoriesDetected = Math.max(
    0,
    image_analysis.total_categories_detected ?? category_distribution.length
  );

  const zoneMultiplier = Number.isFinite(context.zoneMultiplier)
    ? context.zoneMultiplier
    : NEUTRAL_ZONE_MULTIPLIER;

  // Nothing detected: a clean frame is not a civic issue.
  if (objectCount === 0 || category_distribution.length === 0) {
    return {
      score: 0,
      label: "LOW",
      breakdown: {
        volumeScore: 0,
        hazardScore: 0,
        mixScore: 0,
        baseScore: 0,
        confidenceFactor: 1,
        zoneMultiplier,
        zoneBoost: 0,
        recurrenceBonus: 0,
        criticalFloorApplied: false,
        volumeBasis: "count",
        factors: [],
        summary: ["No waste objects were detected in the submitted image."],
      },
    };
  }

  // --- volume -------------------------------------------------------------
  const countVolume = volumeFromCount(objectCount);
  const areaRatio = image_analysis.total_area_ratio;
  const hasArea = typeof areaRatio === "number" && areaRatio >= 0;

  const volumeScore = hasArea
    ? VOLUME_BLEND.area * volumeFromArea(areaRatio) +
      VOLUME_BLEND.count * countVolume
    : countVolume;

  const volumeBasis: ScoreBreakdown["volumeBasis"] = hasArea
    ? "area+count"
    : "count";

  // --- hazard: composition-weighted ---------------------------------------
  // Percentages are shares of the object count, so this is the weighted mean
  // severity of what is actually on the ground.
  const totalPercentage = category_distribution.reduce(
    (sum, row) => sum + row.percentage,
    0
  );

  const weightedMeanSeverity =
    totalPercentage > 0
      ? category_distribution.reduce(
          (sum, row) =>
            sum + (row.percentage / totalPercentage) * categoryWeight(row.category),
          0
        )
      : 0;

  // Rescaled against the least-severe category so that inert litter starts
  // near zero instead of inheriting a large constant floor.
  const hazardScore = clamp(
    ((weightedMeanSeverity - HAZARD_BASELINE_WEIGHT) /
      (1 - HAZARD_BASELINE_WEIGHT)) *
      100,
    0,
    100
  );

  // --- heterogeneity ------------------------------------------------------
  // Mixed waste cannot be cleared by a single segregated collection run.
  // One category is not heterogeneous, so a single category scores zero.
  const mixScore =
    100 *
    clamp(
      (categoriesDetected - 1) / (MIX_SATURATION_CATEGORIES - 1),
      0,
      1
    );

  // --- base ---------------------------------------------------------------
  const baseScore =
    SUBSCORE_WEIGHTS.volume * volumeScore +
    SUBSCORE_WEIGHTS.hazard * hazardScore +
    SUBSCORE_WEIGHTS.mix * mixScore;

  // --- confidence: dampens, never inflates --------------------------------
  const maxConfidence = detections.reduce(
    (max, row) => Math.max(max, row.confidence ?? 0),
    0
  );
  const confidenceFactor = clamp(
    maxConfidence / CONFIDENCE_REFERENCE,
    CONFIDENCE_FLOOR,
    1
  );

  // --- recurrence ---------------------------------------------------------
  const recurrenceBonus = Math.min(
    Math.max(0, context.recurrenceCount) * RECURRENCE_BONUS_PER_REPORT,
    RECURRENCE_BONUS_CAP
  );

  // --- zone escalation ----------------------------------------------------
  // Applied to the headroom that is left, not as a multiplier on the base,
  // so a sensitive location lifts a report towards the ceiling without
  // flattening everything above it into a tie at 100.
  const confidenceAdjusted = baseScore * confidenceFactor;

  const zoneIntensity = clamp(
    (zoneMultiplier - 1) / (ZONE_MULTIPLIER_MAX - 1),
    0,
    1
  );

  const zoneBoost =
    (100 - confidenceAdjusted) * zoneIntensity * ZONE_ESCALATION_GAIN;

  let finalScore = clamp(
    confidenceAdjusted + zoneBoost + recurrenceBonus,
    0,
    100
  );

  // --- critical-category floor --------------------------------------------
  const criticalCategories = category_distribution
    .filter((row) => CRITICAL_CATEGORIES.has(row.category) && row.object_count > 0)
    .map((row) => row.category);

  const criticalFloorApplied =
    criticalCategories.length > 0 && finalScore < CRITICAL_CATEGORY_SCORE_FLOOR;

  if (criticalFloorApplied) {
    finalScore = CRITICAL_CATEGORY_SCORE_FLOOR;
  }

  finalScore = round(finalScore, 1);

  // --- explanation --------------------------------------------------------
  const dominant = [...category_distribution].sort(
    (a, b) => b.percentage - a.percentage
  )[0];

  const factors: BreakdownFactor[] = [
    {
      key: "volume",
      label: "Waste volume",
      value: round(volumeScore),
      detail: hasArea
        ? `${objectCount} objects covering roughly ${round(
            (areaRatio as number) * 100
          )}% of the frame.`
        : `${objectCount} distinct waste objects detected.`,
    },
    {
      key: "hazard",
      label: "Material severity",
      value: round(hazardScore),
      detail: dominant
        ? `Dominant material is ${dominant.category} at ${round(
            dominant.percentage
          )}% of detected objects.`
        : "Material composition unavailable.",
    },
    {
      key: "mix",
      label: "Waste heterogeneity",
      value: round(mixScore),
      detail: `${categoriesDetected} distinct waste ${
        categoriesDetected === 1 ? "category" : "categories"
      } present${
        categoriesDetected > 1 ? ", requiring mixed-stream collection" : ""
      }.`,
    },
    {
      key: "confidence",
      label: "Detection confidence",
      value: round(confidenceFactor, 3),
      detail: `Peak model confidence ${round(maxConfidence)}%${
        confidenceFactor < 1 ? " — score damped accordingly" : ""
      }.`,
    },
    {
      key: "zone",
      label: "Zone sensitivity",
      value: round(zoneBoost, 1),
      detail: context.triggeringPoi
        ? `${describePoiProximity(context.triggeringPoi)} (${context.triggeringPoi.type
            .toLowerCase()
            .replace(/_/g, " ")}) — +${round(zoneBoost, 1)} points.`
        : "No sensitive facility within range.",
    },
  ];

  if (recurrenceBonus > 0) {
    factors.push({
      key: "recurrence",
      label: "Recurring location",
      value: recurrenceBonus,
      detail: `${context.recurrenceCount} prior ${
        context.recurrenceCount === 1 ? "report" : "reports"
      } at this location in the last 30 days.`,
    });
  }

  const summary: string[] = [];

  if (criticalFloorApplied) {
    summary.push(
      `Hazardous material present (${criticalCategories.join(
        ", "
      )}) — minimum priority enforced regardless of volume.`
    );
  }

  if (context.triggeringPoi && zoneMultiplier > 1) {
    summary.push(`Escalated: ${describePoiProximity(context.triggeringPoi)}.`);
  }

  summary.push(factors[0].detail);
  summary.push(factors[1].detail);

  if (recurrenceBonus > 0) {
    summary.push(
      `This location has been reported ${context.recurrenceCount} ` +
        `${context.recurrenceCount === 1 ? "time" : "times"} recently.`
    );
  }

  return {
    score: finalScore,
    label: scoreToLabel(finalScore),
    breakdown: {
      volumeScore: round(volumeScore),
      hazardScore: round(hazardScore),
      mixScore: round(mixScore),
      baseScore: round(baseScore),
      confidenceFactor: round(confidenceFactor, 3),
      zoneMultiplier: round(zoneMultiplier, 2),
      zoneBoost: round(zoneBoost, 1),
      recurrenceBonus,
      criticalFloorApplied,
      volumeBasis,
      factors,
      summary,
    },
  };
}
