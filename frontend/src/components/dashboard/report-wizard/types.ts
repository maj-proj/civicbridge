import type { PriorityLabel } from "@/components/dashboard/PriorityBadge";
import type {
  BreakdownFactor,
  CategoryRow,
} from "@/components/dashboard/ReportInsights";

/** Response shape from POST /api/reports/{garbage,pothole}. */
export interface SubmitResponse {
  success: boolean;
  persisted: boolean;
  warnings: string[];
  report: {
    id: string | null;
    title: string;
    status: string;
    imageUrl: string | null;
    annotatedImageUrl: string | null;
    address: string | null;
    wardName: string | null;
  };
  analysis: {
    image_analysis: {
      total_objects_detected: number;
      total_categories_detected: number;
      total_area_ratio?: number;
    };
    detections: Array<{ class: string; confidence: number; category: string }>;
    category_distribution: CategoryRow[];
  } | null;
  priority: {
    score: number;
    label: PriorityLabel;
    labelText: string;
    breakdown: { factors: BreakdownFactor[]; summary: string[] };
  } | null;
  sensitivity: {
    multiplier: number;
    triggeringPoi: { name: string; distanceMeters: number } | null;
  };
  error?: string;
}

/** Response shape from POST /api/reports/[id]/email?action=prepare. */
export interface EmailDraft {
  draftId: string;
  authorityName: string;
  authorityDesignation: string | null;
  intendedTo: string;
  ccEmails: string[];
  subject: string;
  body: string;
  bodyHtml: string | null;
  routingRationale: string[];
  aiGenerated: boolean;
  slaHours: number;
  mode: string;
  deliverTo: string;
  redirected: boolean;
  blocker: string | null;
}

/** Response shape from POST /api/reports/[id]/email?action=send. */
export interface DeliveryResult {
  status: string;
  mode: string;
  actualTo: string;
  intendedTo: string;
  providerMessageId?: string;
}

/** Everything that differs between the garbage and pothole tracks. */
export interface IssueTrackConfig {
  endpoint: string;
  cardTitle: string;
  cardDescription: string;
  classificationLabel: string;
  classificationHelp: string;
  classifications: Record<string, string>;
  defaultClassification: string;
  photoLabel: string;
  photoRequiredError: string;
  landmarkPlaceholder: string;
  detailsPlaceholder: string;
  submitLabel: string;
}
