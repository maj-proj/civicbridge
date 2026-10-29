/**
 * Priority scoring for road defects.
 *
 *   base     = 0.55 x severity + 0.45 x extent
 *   adjusted = base x confidenceFactor
 *   score    = adjusted + zoneBoost + recurrenceBonus
 *
 * Separate from computePriority because the two tracks measure different
 * things. Garbage asks what the material is and how much of it there is;
 * a pothole has no material, and one deep hole in a carriageway is worse
 * than a dozen hairline cracks. Reusing the waste scorer would have meant
 * describing a road defect in terms of plastic and paper.
 *
 * Pure, like its sibling: no database, no fetch, no clock. Everything it
 * needs arrives as arguments, which is what makes the thresholds testable.
 */

import type { PotholePredictResponse } from "@/lib/types/potholeDetection";
import {
  CONFIDENCE_FLOOR,
  CONFIDENCE_REFERENCE,
  POTHOLE_AREA_FULL_SCORE,
  POTHOLE_COUNT_SATURATION,
  POTHOLE_SUBSCORE_WEIGHTS,
  RECURRENCE_BONUS_CAP,
  RECURRENCE_BONUS_PER_REPORT,
  ZONE_ESCALATION_GAIN,
  ZONE_MULTIPLIER_MAX,
} from "./weights";
import {
  scoreToLabel,
  type BreakdownFactor,
  type PriorityContext,
  type PriorityResult,
  type ScoreBreakdown,
  type TriggeringPoi,
} from "./computePriority";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Saturating curve: each extra defect adds less than the one before. */
function saturate(count: number, k: number): number {
  if (count <= 0) return 0;
  return 100 * (1 - Math.exp(-count / k));
}

function describePoi(poi: TriggeringPoi): string {
  if (poi.source === "mention" || poi.distanceMeters == null) {
    return `${poi.name} named in the report text (not location-verified)`;
  }
  return `${Math.round(poi.distanceMeters)}m from ${poi.name}`;
}

export function computePotholePriority(
  analysis: PotholePredictResponse,
  context: PriorityContext
): PriorityResult {
  const { detections, image_analysis } = analysis;

  const defectCount = image_analysis.total_objects_detected ?? detections.length;

  // Nothing detected: no score to give. The report still reaches an
  // authority, it just carries no automated assessment.
  if (defectCount === 0 || detections.length === 0) {
    const factors: BreakdownFactor[] = [
      {
        key: "severity",
        label: "Defect severity",
        value: 0,
        detail: "No road defect was detected in the photograph.",
      },
    ];

    return {
      score: 0,
      label: scoreToLabel(0),
      breakdown: {
        volumeScore: 0,
        hazardScore: 0,
        mixScore: 0,
        baseScore: 0,
        confidenceFactor: 1,
        zoneMultiplier: context.zoneMultiplier,
        zoneBoost: 0,
        recurrenceBonus: 0,
        criticalFloorApplied: false,
        volumeBasis: "count",
        factors,
        summary: ["No road defect was detected, so no priority was assigned."],
      },
    };
  }

  // --- severity: the worst single defect decides ---------------------------
  // A carriageway is as dangerous as its deepest hole; averaging would let a
  // scatter of hairline cracks mask one wheel-swallowing crater.
  const worstSeverity = clamp(
    image_analysis.worst_severity_score ??
      detections.reduce((max, row) => Math.max(max, row.severity_score), 0),
    0,
    100
  );

  // --- extent: how much of the road surface is affected --------------------
  const countScore = saturate(defectCount, POTHOLE_COUNT_SATURATION);

  const areaRatio = image_analysis.total_area_ratio;
  const hasArea = typeof areaRatio === "number" && areaRatio > 0;
  const areaScore = hasArea
    ? clamp((areaRatio / POTHOLE_AREA_FULL_SCORE) * 100, 0, 100)
    : 0;

  const extentScore = hasArea
    ? 0.5 * countScore + 0.5 * areaScore
    : countScore;

  // --- base ----------------------------------------------------------------
  const baseScore =
    POTHOLE_SUBSCORE_WEIGHTS.severity * worstSeverity +
    POTHOLE_SUBSCORE_WEIGHTS.extent * extentScore;

  // --- confidence: dampens, never inflates ---------------------------------
  const maxConfidence = detections.reduce(
    (max, row) => Math.max(max, row.confidence ?? 0),
    0
  );
  const confidenceFactor = clamp(
    maxConfidence / CONFIDENCE_REFERENCE,
    CONFIDENCE_FLOOR,
    1
  );

  const confidenceAdjusted = baseScore * confidenceFactor;

  // --- recurrence ----------------------------------------------------------
  const recurrenceBonus = Math.min(
    Math.max(0, context.recurrenceCount) * RECURRENCE_BONUS_PER_REPORT,
    RECURRENCE_BONUS_CAP
  );

  // --- zone escalation -----------------------------------------------------
  const zoneMultiplier = Number.isFinite(context.zoneMultiplier)
    ? context.zoneMultiplier
    : 1;

  const zoneIntensity = clamp(
    (zoneMultiplier - 1) / (ZONE_MULTIPLIER_MAX - 1),
    0,
    1
  );

  const zoneBoost =
    (100 - confidenceAdjusted) * zoneIntensity * ZONE_ESCALATION_GAIN;

  const finalScore = clamp(
    confidenceAdjusted + zoneBoost + recurrenceBonus,
    0,
    100
  );

  // --- breakdown -----------------------------------------------------------
  const worstLevel = image_analysis.worst_severity_level ?? "Low";

  const factors: BreakdownFactor[] = [
    {
      key: "severity",
      label: "Defect severity",
      value: round(worstSeverity, 1),
      detail: `Worst defect rated ${worstLevel} (${round(
        worstSeverity,
        1
      )}/100), from the share of the frame it fills.`,
    },
    {
      key: "extent",
      label: "Extent of damage",
      value: round(extentScore, 1),
      detail: hasArea
        ? `${defectCount} ${defectCount === 1 ? "defect" : "defects"} covering roughly ${round(
            (areaRatio as number) * 100,
            2
          )}% of the frame.`
        : `${defectCount} ${defectCount === 1 ? "defect" : "defects"} detected.`,
    },
    {
      key: "confidence",
      label: "Detection confidence",
      value: round(confidenceFactor, 2),
      detail: `Peak model confidence ${round(maxConfidence, 2)}%${
        confidenceFactor < 1 ? " — score damped accordingly" : ""
      }.`,
    },
    {
      key: "zone",
      label: "Zone sensitivity",
      value: round(zoneBoost, 1),
      detail: context.triggeringPoi
        ? `${describePoi(context.triggeringPoi)} (${context.triggeringPoi.type
            .toLowerCase()
            .replace(/_/g, " ")}) — +${round(zoneBoost, 1)} points.`
        : "No sensitive facility within range.",
    },
  ];

  if (recurrenceBonus > 0) {
    factors.push({
      key: "recurrence",
      label: "Recurring location",
      value: round(recurrenceBonus, 1),
      detail: `${context.recurrenceCount} prior report${
        context.recurrenceCount === 1 ? "" : "s"
      } at this location in the last 30 days.`,
    });
  }

  const summary: string[] = [factors[0].detail, factors[1].detail];

  if (context.triggeringPoi && zoneMultiplier > 1) {
    summary.push(`Escalated: ${describePoi(context.triggeringPoi)}.`);
  }

  // The shared ScoreBreakdown shape is waste-shaped; the pothole subscores
  // are mapped onto it so one renderer and one Json column serve both tracks.
  const breakdown: ScoreBreakdown = {
    volumeScore: round(extentScore, 1),
    hazardScore: round(worstSeverity, 1),
    mixScore: 0,
    baseScore: round(baseScore, 1),
    confidenceFactor: round(confidenceFactor, 2),
    zoneMultiplier: round(zoneMultiplier, 2),
    zoneBoost: round(zoneBoost, 1),
    recurrenceBonus: round(recurrenceBonus, 1),
    criticalFloorApplied: false,
    volumeBasis: hasArea ? "area+count" : "count",
    factors,
    summary,
  };

  return {
    score: round(finalScore, 1),
    label: scoreToLabel(finalScore),
    breakdown,
  };
}
