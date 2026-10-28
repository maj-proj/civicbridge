/**
 * The frozen contract for the YOLOv8 service's POST /predict response.
 *
 * This is the single place the Python-side shape is described. Everything
 * downstream reads these types, so a change in the service surfaces as one
 * validation failure here rather than as silently wrong priority scores.
 */

/** Coarse waste categories. Mirrors backend/categories.py. */
export const WASTE_CATEGORIES = [
  "Plastic",
  "Paper/Cardboard",
  "Glass",
  "Metal",
  "Organic/Food",
  "Biomedical/Hazardous",
  "E-waste",
  "Other",
] as const;

export type WasteCategory = (typeof WASTE_CATEGORIES)[number];

/**
 * One row per *unique class*, carrying that class's highest confidence —
 * not one row per detected object. `total_objects_detected` is the object
 * count; this array is the class summary.
 */
export interface DetectionRow {
  class: string;
  /** Percentage, 0–100. */
  confidence: number;
  category: string;
  /** How many objects of this class were found. Optional: added by our service. */
  object_count?: number;
}

export interface CategoryDistributionRow {
  category: string;
  object_count: number;
  /** Percentage of total objects, 0–100. */
  percentage: number;
}

export interface ImageAnalysis {
  total_objects_detected: number;
  total_categories_detected: number;
  percentage_basis: string;
  /**
   * Union of all bounding boxes over the frame area, 0–1.
   *
   * Optional, and the scorer works without it — but object count alone
   * cannot distinguish 20 scattered bottle caps from 20 overflowing bags.
   * When present, volume scoring blends area with count.
   */
  total_area_ratio?: number;
  image_width?: number;
  image_height?: number;
}

export interface PredictResponse {
  success: boolean;
  image_analysis: ImageAnalysis;
  detections: DetectionRow[];
  category_distribution: CategoryDistributionRow[];
  /** Path on the vision service, e.g. "/static/annotated/abc_annotated.jpg". */
  annotated_image_url?: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

export class DetectionContractError extends Error {
  constructor(message: string) {
    super(`Vision service contract violation: ${message}`);
    this.name = "DetectionContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, path: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new DetectionContractError(`${path} must be a number, got ${typeof value}`);
  }
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new DetectionContractError(`${path} must be a string, got ${typeof value}`);
  }
  return value;
}

/**
 * Validates and narrows an untrusted /predict payload.
 * Throws DetectionContractError on anything unexpected.
 */
export function parsePredictResponse(raw: unknown): PredictResponse {
  if (!isRecord(raw)) {
    throw new DetectionContractError("response body is not an object");
  }

  if (raw.success === false) {
    throw new DetectionContractError(
      typeof raw.error === "string" ? raw.error : "service reported failure"
    );
  }

  if (!isRecord(raw.image_analysis)) {
    throw new DetectionContractError("image_analysis is missing");
  }

  const analysis = raw.image_analysis;

  if (!Array.isArray(raw.detections)) {
    throw new DetectionContractError("detections must be an array");
  }

  if (!Array.isArray(raw.category_distribution)) {
    throw new DetectionContractError("category_distribution must be an array");
  }

  const detections: DetectionRow[] = raw.detections.map((row, i) => {
    if (!isRecord(row)) {
      throw new DetectionContractError(`detections[${i}] is not an object`);
    }
    return {
      class: str(row.class, `detections[${i}].class`),
      confidence: num(row.confidence, `detections[${i}].confidence`),
      category: str(row.category, `detections[${i}].category`),
      object_count:
        typeof row.object_count === "number" ? row.object_count : undefined,
    };
  });

  const categoryDistribution: CategoryDistributionRow[] =
    raw.category_distribution.map((row, i) => {
      if (!isRecord(row)) {
        throw new DetectionContractError(
          `category_distribution[${i}] is not an object`
        );
      }
      return {
        category: str(row.category, `category_distribution[${i}].category`),
        object_count: num(
          row.object_count,
          `category_distribution[${i}].object_count`
        ),
        percentage: num(row.percentage, `category_distribution[${i}].percentage`),
      };
    });

  return {
    success: true,
    image_analysis: {
      total_objects_detected: num(
        analysis.total_objects_detected,
        "image_analysis.total_objects_detected"
      ),
      total_categories_detected: num(
        analysis.total_categories_detected,
        "image_analysis.total_categories_detected"
      ),
      percentage_basis:
        typeof analysis.percentage_basis === "string"
          ? analysis.percentage_basis
          : "object_count",
      total_area_ratio:
        typeof analysis.total_area_ratio === "number"
          ? analysis.total_area_ratio
          : undefined,
      image_width:
        typeof analysis.image_width === "number" ? analysis.image_width : undefined,
      image_height:
        typeof analysis.image_height === "number"
          ? analysis.image_height
          : undefined,
    },
    detections,
    category_distribution: categoryDistribution,
    annotated_image_url:
      typeof raw.annotated_image_url === "string" ? raw.annotated_image_url : null,
  };
}
