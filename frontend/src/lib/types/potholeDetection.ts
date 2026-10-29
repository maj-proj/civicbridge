/**
 * The pothole half of the detection service's contract.
 *
 * Kept separate from detection.ts because the two tracks report genuinely
 * different things: garbage reports what material is present, potholes report
 * how large each defect is. Forcing them into one shape would mean a pile of
 * optional fields that are meaningless on one side or the other.
 *
 * As with the garbage parser, anything the service might add later is
 * tolerated; anything the scorer depends on is required.
 */

export class PotholeContractError extends Error {
  constructor(message: string) {
    super(`Pothole detection contract violated: ${message}`);
    this.name = "PotholeContractError";
  }
}

export type SeverityLevel = "Low" | "Medium" | "High";

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PotholeDetectionRow {
  id: number;
  class: string;
  confidence: number;
  /** 0–100, from the share of the frame the defect fills. */
  severity_score: number;
  severity_level: SeverityLevel;
  bounding_box: BoundingBox;
}

export interface PotholeImageAnalysis {
  total_objects_detected: number;
  issue_detected: boolean;
  total_area_ratio?: number;
  image_width?: number;
  image_height?: number;
  worst_severity_score?: number;
  worst_severity_level?: SeverityLevel;
}

export interface PotholePredictResponse {
  success: boolean;
  issue_type?: string;
  image_analysis: PotholeImageAnalysis;
  detections: PotholeDetectionRow[];
  annotated_image_url?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PotholeContractError(`${field} must be a finite number`);
  }
  return value;
}

function optionalNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function severityLevel(value: unknown): SeverityLevel {
  return value === "High" || value === "Medium" || value === "Low"
    ? value
    : "Low";
}

export function parsePotholeResponse(raw: unknown): PotholePredictResponse {
  if (!isRecord(raw)) {
    throw new PotholeContractError("response is not an object");
  }

  if (raw.success !== true) {
    throw new PotholeContractError(
      typeof raw.error === "string" ? raw.error : "success was not true"
    );
  }

  if (!isRecord(raw.image_analysis)) {
    throw new PotholeContractError("image_analysis is missing");
  }

  if (!Array.isArray(raw.detections)) {
    throw new PotholeContractError("detections must be an array");
  }

  const analysis = raw.image_analysis;

  const detections: PotholeDetectionRow[] = raw.detections.map((row, index) => {
    if (!isRecord(row)) {
      throw new PotholeContractError(`detections[${index}] is not an object`);
    }

    const box = isRecord(row.bounding_box) ? row.bounding_box : {};

    return {
      id: optionalNum(row.id) ?? index + 1,
      class: typeof row.class === "string" ? row.class : "pothole",
      confidence: num(row.confidence, `detections[${index}].confidence`),
      severity_score: num(
        row.severity_score,
        `detections[${index}].severity_score`
      ),
      severity_level: severityLevel(row.severity_level),
      bounding_box: {
        x1: optionalNum(box.x1) ?? 0,
        y1: optionalNum(box.y1) ?? 0,
        x2: optionalNum(box.x2) ?? 0,
        y2: optionalNum(box.y2) ?? 0,
      },
    };
  });

  const worstFromRows = detections.reduce(
    (max, row) => Math.max(max, row.severity_score),
    0
  );

  return {
    success: true,
    issue_type: typeof raw.issue_type === "string" ? raw.issue_type : "pothole",
    image_analysis: {
      total_objects_detected:
        optionalNum(analysis.total_objects_detected) ?? detections.length,
      issue_detected:
        typeof analysis.issue_detected === "boolean"
          ? analysis.issue_detected
          : detections.length > 0,
      total_area_ratio: optionalNum(analysis.total_area_ratio),
      image_width: optionalNum(analysis.image_width),
      image_height: optionalNum(analysis.image_height),
      // Older builds of the service did not send these; derive them so the
      // scorer never has to care which version answered.
      worst_severity_score:
        optionalNum(analysis.worst_severity_score) ?? worstFromRows,
      worst_severity_level: analysis.worst_severity_level
        ? severityLevel(analysis.worst_severity_level)
        : severityLevel(
            detections.find((row) => row.severity_score === worstFromRows)
              ?.severity_level
          ),
    },
    detections,
    annotated_image_url:
      typeof raw.annotated_image_url === "string"
        ? raw.annotated_image_url
        : null,
  };
}
