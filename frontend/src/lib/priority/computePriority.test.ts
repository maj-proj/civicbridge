/**
 * Pins the priority engine's behaviour, including the band thresholds —
 * changing a threshold without changing this file silently reclassifies
 * every report already in the database.
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePriority, scoreToLabel } from "@/lib/priority/computePriority";
import type { PriorityContext } from "@/lib/priority/computePriority";
import type {
  CategoryDistributionRow,
  DetectionRow,
  PredictResponse,
} from "@/lib/types/detection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildAnalysis(options: {
  objects: number;
  distribution: Array<[category: string, count: number]>;
  maxConfidence?: number;
  areaRatio?: number;
}): PredictResponse {
  const total = options.objects;

  const category_distribution: CategoryDistributionRow[] = options.distribution.map(
    ([category, count]) => ({
      category,
      object_count: count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    })
  );

  const detections: DetectionRow[] = options.distribution.map(
    ([category, count]) => ({
      class: `${category.toLowerCase()} item`,
      confidence: options.maxConfidence ?? 92,
      category,
      object_count: count,
    })
  );

  return {
    success: true,
    image_analysis: {
      total_objects_detected: total,
      total_categories_detected: options.distribution.length,
      percentage_basis: "object_count",
      total_area_ratio: options.areaRatio,
    },
    detections,
    category_distribution,
  };
}

const neutralContext: PriorityContext = {
  zoneMultiplier: 1.0,
  triggeringPoi: null,
  recurrenceCount: 0,
};

const hospitalContext: PriorityContext = {
  zoneMultiplier: 1.6,
  triggeringPoi: {
    name: "Narayana Multispeciality Hospital, HSR",
    type: "HOSPITAL",
    distanceMeters: 120,
    weight: 1.6,
  },
  recurrenceCount: 0,
};

// ---------------------------------------------------------------------------

describe("scoreToLabel", () => {
  it("pins the four band boundaries", () => {
    assert.equal(scoreToLabel(0), "LOW");
    assert.equal(scoreToLabel(29), "LOW");
    assert.equal(scoreToLabel(30), "MEDIUM");
    assert.equal(scoreToLabel(54), "MEDIUM");
    assert.equal(scoreToLabel(55), "HIGH");
    assert.equal(scoreToLabel(79), "HIGH");
    assert.equal(scoreToLabel(80), "VERY_HIGH");
    assert.equal(scoreToLabel(100), "VERY_HIGH");
  });
});

describe("computePriority", () => {
  it("scores a clean frame as zero", () => {
    const result = computePriority(
      buildAnalysis({ objects: 0, distribution: [] }),
      neutralContext
    );

    assert.equal(result.score, 0);
    assert.equal(result.label, "LOW");
    assert.match(result.breakdown.summary[0], /No waste objects/);
  });

  it("keeps a small amount of inert litter in the lower bands", () => {
    const result = computePriority(
      buildAnalysis({ objects: 3, distribution: [["Paper/Cardboard", 3]] }),
      neutralContext
    );

    assert.ok(
      result.score < 55,
      `expected sub-HIGH for light paper litter, got ${result.score}`
    );
    assert.ok(["LOW", "MEDIUM"].includes(result.label));
  });

  it("escalates the sample payload from the service contract", () => {
    // The 20-object / 3-category example from the /predict spec.
    const result = computePriority(
      buildAnalysis({
        objects: 20,
        distribution: [
          ["Plastic", 12],
          ["Paper/Cardboard", 5],
          ["Other", 3],
        ],
        maxConfidence: 94.71,
      }),
      neutralContext
    );

    assert.ok(result.score > 30, `expected at least MEDIUM, got ${result.score}`);
    assert.equal(result.breakdown.volumeBasis, "count");
    assert.equal(result.breakdown.zoneMultiplier, 1);
  });

  it("raises the score for the same waste near a hospital", () => {
    const payload = buildAnalysis({
      objects: 20,
      distribution: [
        ["Plastic", 12],
        ["Paper/Cardboard", 5],
        ["Other", 3],
      ],
    });

    const neutral = computePriority(payload, neutralContext);
    const sensitive = computePriority(payload, hospitalContext);

    assert.ok(
      sensitive.score > neutral.score,
      "zone sensitivity must increase the score"
    );
    assert.match(sensitive.breakdown.summary.join(" "), /Narayana/);
  });

  it("forces at least HIGH when biomedical waste is present", () => {
    // One syringe: volume is near zero, but it is still a health hazard.
    const result = computePriority(
      buildAnalysis({ objects: 1, distribution: [["Biomedical/Hazardous", 1]] }),
      neutralContext
    );

    assert.equal(result.breakdown.criticalFloorApplied, true);
    assert.ok(result.score >= 55);
    assert.equal(result.label, "HIGH");
    assert.match(result.breakdown.summary[0], /Hazardous material present/);
  });

  it("reaches VERY_HIGH for a large hazardous dump beside a hospital", () => {
    const result = computePriority(
      buildAnalysis({
        objects: 60,
        distribution: [
          ["Biomedical/Hazardous", 25],
          ["Organic/Food", 20],
          ["Plastic", 10],
          ["Glass", 5],
        ],
        maxConfidence: 96,
      }),
      hospitalContext
    );

    assert.equal(result.label, "VERY_HIGH");
    assert.ok(result.score >= 80);
  });

  it("damps the score when model confidence is low", () => {
    const high = computePriority(
      buildAnalysis({
        objects: 25,
        distribution: [["Plastic", 25]],
        maxConfidence: 95,
      }),
      neutralContext
    );

    const low = computePriority(
      buildAnalysis({
        objects: 25,
        distribution: [["Plastic", 25]],
        maxConfidence: 40,
      }),
      neutralContext
    );

    assert.ok(low.score < high.score);
    assert.ok(
      low.breakdown.confidenceFactor >= 0.6,
      "confidence factor must not fall below the floor"
    );
    assert.ok(high.breakdown.confidenceFactor <= 1, "confidence must never inflate");
  });

  it("caps the recurrence bonus at +15", () => {
    const payload = buildAnalysis({ objects: 10, distribution: [["Plastic", 10]] });

    const three = computePriority(payload, {
      ...neutralContext,
      recurrenceCount: 3,
    });
    const twenty = computePriority(payload, {
      ...neutralContext,
      recurrenceCount: 20,
    });

    assert.equal(three.breakdown.recurrenceBonus, 15);
    assert.equal(twenty.breakdown.recurrenceBonus, 15);
  });

  it("treats unknown categories as the default weight rather than failing", () => {
    const result = computePriority(
      buildAnalysis({ objects: 8, distribution: [["Nonsense Category", 8]] }),
      neutralContext
    );

    assert.ok(result.score > 0);
    assert.ok(Number.isFinite(result.score));
  });

  it("blends area into volume when the service provides it", () => {
    const countOnly = computePriority(
      buildAnalysis({ objects: 10, distribution: [["Plastic", 10]] }),
      neutralContext
    );

    const withLargeArea = computePriority(
      buildAnalysis({
        objects: 10,
        distribution: [["Plastic", 10]],
        areaRatio: 0.5,
      }),
      neutralContext
    );

    assert.equal(countOnly.breakdown.volumeBasis, "count");
    assert.equal(withLargeArea.breakdown.volumeBasis, "area+count");
    assert.ok(
      withLargeArea.score > countOnly.score,
      "10 objects filling half the frame must outrank 10 unknown-size objects"
    );
  });

  it("never exceeds 100 or drops below 0", () => {
    const extreme = computePriority(
      buildAnalysis({
        objects: 500,
        distribution: [["Biomedical/Hazardous", 500]],
        maxConfidence: 100,
        areaRatio: 1,
      }),
      { zoneMultiplier: 1.6, triggeringPoi: null, recurrenceCount: 50 }
    );

    assert.ok(extreme.score <= 100);
    assert.ok(extreme.score >= 0);
  });

  it("always returns a breakdown that can be rendered", () => {
    const result = computePriority(
      buildAnalysis({
        objects: 15,
        distribution: [
          ["Plastic", 10],
          ["Glass", 5],
        ],
      }),
      hospitalContext
    );

    assert.ok(result.breakdown.factors.length >= 5);
    for (const factor of result.breakdown.factors) {
      assert.ok(factor.label.length > 0);
      assert.ok(factor.detail.length > 0);
      assert.ok(Number.isFinite(factor.value));
    }
    assert.ok(result.breakdown.summary.length > 0);
  });
});
