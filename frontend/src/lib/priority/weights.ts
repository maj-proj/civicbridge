/**
 * Tunable constants for the priority engine.
 *
 * Everything the algorithm can be argued about lives in this file, so
 * calibration is a diff here rather than a hunt through the scorer.
 */

/**
 * Public-health severity per waste category, 0–1.
 *
 * Rationale for the ordering: biomedical waste is a direct infection
 * vector; organic waste draws vermin and spreads disease faster than inert
 * material; glass and metal cause injury; plastic is mostly a blight and a
 * drainage problem; paper degrades on its own.
 */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  "Biomedical/Hazardous": 1.0,
  "E-waste": 0.8,
  "Organic/Food": 0.75,
  Glass: 0.6,
  Metal: 0.6,
  Plastic: 0.5,
  "Paper/Cardboard": 0.3,
  Other: 0.45,
};

/** Applied to any category the model emits that is not in the table above. */
export const DEFAULT_CATEGORY_WEIGHT = 0.45;

export function categoryWeight(category: string): number {
  return CATEGORY_WEIGHTS[category] ?? DEFAULT_CATEGORY_WEIGHT;
}

/**
 * Categories that force a minimum score regardless of volume. A single
 * syringe is a HIGH-priority public-health problem even though one object
 * scores near zero on volume.
 */
export const CRITICAL_CATEGORIES: ReadonlySet<string> = new Set([
  "Biomedical/Hazardous",
]);

export const CRITICAL_CATEGORY_SCORE_FLOOR = 55;

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

/**
 * Object count at which the volume curve reaches ~63% of its maximum.
 * The curve is saturating (1 - e^-n/k), not linear: 200 objects is worse
 * than 20, but nowhere near ten times worse.
 */
export const VOLUME_SATURATION_K = 12;

/** Categories present at which the heterogeneity subscore maxes out. */
export const MIX_SATURATION_CATEGORIES = 4;

/**
 * Hazard is rescaled against the least-severe category rather than against
 * zero. Without this, pure paper litter still scores 30/100 on severity and
 * every report inherits a large constant floor, compressing the useful range.
 */
export const HAZARD_BASELINE_WEIGHT = 0.3;

/**
 * Zone sensitivity is applied to the *remaining headroom*, not as a raw
 * multiplier on the base score. A plain multiplier saturates: any base above
 * ~63 multiplied by 1.6 pins at 100, so a moderate pile near a market would
 * tie with a hazardous dump outside a hospital. Escalating a share of what is
 * left preserves the ordering instead.
 */
export const ZONE_ESCALATION_GAIN = 0.55;

/** Highest multiplier any seeded zone carries; used to normalise the gain. */
export const ZONE_MULTIPLIER_MAX = 1.6;

/** Weights of the three subscores. Must sum to 1. */
export const SUBSCORE_WEIGHTS = {
  volume: 0.5,
  hazard: 0.35,
  mix: 0.15,
} as const;

/**
 * When total_area_ratio is available, volume blends area with count.
 * Area is the better signal, so it carries more.
 */
export const VOLUME_BLEND = {
  area: 0.6,
  count: 0.4,
} as const;

/** Area ratio at which the area-based volume subscore reaches 100. */
export const AREA_RATIO_FULL_SCORE = 0.45;

/**
 * Confidence scaling. A low-confidence detection dampens the score; it
 * never inflates it, which is why the range is capped at 1.0.
 */
export const CONFIDENCE_REFERENCE = 85;
export const CONFIDENCE_FLOOR = 0.6;

/** +5 per prior nearby report, capped. */
export const RECURRENCE_BONUS_PER_REPORT = 5;
export const RECURRENCE_BONUS_CAP = 15;

/** Band thresholds. Pinned by unit tests — changing these reclassifies reports. */
export const PRIORITY_BANDS = {
  LOW: { min: 0, max: 29 },
  MEDIUM: { min: 30, max: 54 },
  HIGH: { min: 55, max: 79 },
  VERY_HIGH: { min: 80, max: 100 },
} as const;

/** Default multiplier when no sensitive zone is nearby. */
export const NEUTRAL_ZONE_MULTIPLIER = 1.0;

/**
 * How much of a zone's escalation a *mention* in the reporter's own text is
 * worth, compared with a measured distance from real coordinates.
 *
 * Deliberately well under 1. Coordinates are evidence; typed text is a claim,
 * and an unverifiable one — without this discount anyone could write "near
 * the hospital" and buy themselves a High rating. A mention is enough to say
 * the site deserves a closer look, not enough to match a GPS fix.
 */
export const MENTION_CONFIDENCE = {
  /** Named unambiguously: full name, a real acronym, or several rare words. */
  strong: 0.6,
  /** Recognisable but loose — a short acronym, or one distinctive word. */
  weak: 0.35,
} as const;
