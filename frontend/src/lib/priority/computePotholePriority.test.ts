import test from "node:test";
import assert from "node:assert/strict";

import { computePotholePriority } from "./computePotholePriority";
import type {
  PotholePredictResponse,
  SeverityLevel,
} from "@/lib/types/potholeDetection";

const NEUTRAL = { zoneMultiplier: 1, triggeringPoi: null, recurrenceCount: 0 };

function defect(
  severity: number,
  level: SeverityLevel,
  confidence = 90,
  id = 1
) {
  return {
    id,
    class: "pothole",
    confidence,
    severity_score: severity,
    severity_level: level,
    bounding_box: { x1: 0, y1: 0, x2: 10, y2: 10 },
  };
}

function response(
  detections: ReturnType<typeof defect>[],
  areaRatio?: number
): PotholePredictResponse {
  const worst = detections.reduce(
    (max, row) => Math.max(max, row.severity_score),
    0
  );
  const worstRow = detections.find((row) => row.severity_score === worst);

  return {
    success: true,
    issue_type: "pothole",
    image_analysis: {
      total_objects_detected: detections.length,
      issue_detected: detections.length > 0,
      total_area_ratio: areaRatio,
      worst_severity_score: worst,
      worst_severity_level: worstRow?.severity_level ?? "Low",
    },
    detections,
  };
}

test("computePotholePriority", async (t) => {
  await t.test("an empty frame scores zero", () => {
    const result = computePotholePriority(response([]), NEUTRAL);
    assert.equal(result.score, 0);
    assert.equal(result.label, "LOW");
    assert.match(result.breakdown.summary[0], /No road defect/);
  });

  await t.test("one shallow defect stays low", () => {
    const result = computePotholePriority(
      response([defect(10, "Low")], 0.01),
      NEUTRAL
    );
    assert.ok(result.score < 30, `expected LOW band, got ${result.score}`);
    assert.equal(result.label, "LOW");
  });

  await t.test("one severe defect outranks several shallow ones", () => {
    const severe = computePotholePriority(
      response([defect(100, "High")], 0.12),
      NEUTRAL
    );
    const scattered = computePotholePriority(
      response(
        [
          defect(12, "Low", 90, 1),
          defect(10, "Low", 90, 2),
          defect(14, "Low", 90, 3),
          defect(9, "Low", 90, 4),
        ],
        0.05
      ),
      NEUTRAL
    );

    assert.ok(
      severe.score > scattered.score,
      `one crater (${severe.score}) should outrank four cracks (${scattered.score})`
    );
  });

  await t.test("severity dominates but extent still counts", () => {
    const one = computePotholePriority(response([defect(60, "Medium")], 0.05), NEUTRAL);
    const many = computePotholePriority(
      response(
        [
          defect(60, "Medium", 90, 1),
          defect(55, "Medium", 90, 2),
          defect(50, "Medium", 90, 3),
          defect(45, "Medium", 90, 4),
          defect(40, "Medium", 90, 5),
        ],
        0.2
      ),
      NEUTRAL
    );

    assert.ok(
      many.score > one.score,
      "the same worst severity spread over more defects must score higher"
    );
  });

  await t.test("a sensitive zone escalates without saturating", () => {
    const plain = computePotholePriority(
      response([defect(50, "Medium")], 0.06),
      NEUTRAL
    );
    const nearSchool = computePotholePriority(response([defect(50, "Medium")], 0.06), {
      zoneMultiplier: 1.5,
      triggeringPoi: {
        name: "A School",
        type: "SCHOOL",
        distanceMeters: 120,
        weight: 1.5,
        source: "coordinates",
      },
      recurrenceCount: 0,
    });

    assert.ok(nearSchool.score > plain.score);
    assert.ok(nearSchool.score < 100, "escalation must not pin to the ceiling");
    assert.match(
      nearSchool.breakdown.summary.join(" "),
      /120m from A School/
    );
  });

  await t.test("a mention is labelled, not presented as measured", () => {
    const result = computePotholePriority(response([defect(50, "Medium")], 0.06), {
      zoneMultiplier: 1.27,
      triggeringPoi: {
        name: "JSS Academy of Technical Education",
        type: "COLLEGE",
        distanceMeters: null,
        weight: 1.45,
        source: "mention",
      },
      recurrenceCount: 0,
    });

    assert.match(
      result.breakdown.summary.join(" "),
      /named in the report text \(not location-verified\)/
    );
  });

  await t.test("low model confidence damps the score", () => {
    const confident = computePotholePriority(
      response([defect(80, "High", 95)], 0.1),
      NEUTRAL
    );
    const unsure = computePotholePriority(
      response([defect(80, "High", 30)], 0.1),
      NEUTRAL
    );

    assert.ok(unsure.score < confident.score);
  });

  await t.test("recurrence is capped", () => {
    const once = computePotholePriority(response([defect(40, "Medium")], 0.04), {
      ...NEUTRAL,
      recurrenceCount: 1,
    });
    const many = computePotholePriority(response([defect(40, "Medium")], 0.04), {
      ...NEUTRAL,
      recurrenceCount: 50,
    });

    assert.ok(many.score > once.score);
    assert.ok(
      many.breakdown.recurrenceBonus <= 15,
      `recurrence bonus ${many.breakdown.recurrenceBonus} exceeded the cap`
    );
  });

  await t.test("never leaves the 0-100 range", () => {
    const extreme = computePotholePriority(
      response(
        Array.from({ length: 40 }, (_, i) => defect(100, "High", 99, i + 1)),
        0.9
      ),
      {
        zoneMultiplier: 1.6,
        triggeringPoi: {
          name: "A Hospital",
          type: "HOSPITAL",
          distanceMeters: 10,
          weight: 1.6,
          source: "coordinates",
        },
        recurrenceCount: 99,
      }
    );

    assert.ok(extreme.score <= 100 && extreme.score >= 0);
    assert.equal(extreme.label, "VERY_HIGH");
  });

  await t.test("works without an area ratio", () => {
    const result = computePotholePriority(response([defect(70, "High")]), NEUTRAL);
    assert.ok(result.score > 0);
    assert.equal(result.breakdown.volumeBasis, "count");
  });

  await t.test("always returns a renderable breakdown", () => {
    const result = computePotholePriority(response([defect(55, "Medium")], 0.07), NEUTRAL);

    assert.ok(result.breakdown.factors.length >= 4);
    for (const factor of result.breakdown.factors) {
      assert.ok(factor.key && factor.label && factor.detail);
      assert.equal(typeof factor.value, "number");
    }
    assert.ok(result.breakdown.summary.length > 0);
  });
});
