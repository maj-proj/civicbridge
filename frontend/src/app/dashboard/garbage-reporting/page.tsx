import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  IssueReportWizard,
  type IssueTrackConfig,
} from "@/components/dashboard/report-wizard/IssueReportWizard";

const GARBAGE_TRACK: IssueTrackConfig = {
  endpoint: "/api/reports/garbage",
  cardTitle: "Incident details",
  cardDescription:
    "Photographic evidence and coordinates drive the automated assessment.",
  classificationLabel: "Waste classification",
  classificationHelp:
    "Your assessment. The model classifies the image independently.",
  classifications: {
    mixed: "Mixed / open dump",
    plastic: "Plastic / debris",
    overflow: "Overflowing bin",
    hazardous: "Bio / hazardous waste",
  },
  defaultClassification: "mixed",
  photoLabel: "Photograph",
  photoRequiredError:
    "A photograph is required — the assessment runs on the image.",
  landmarkPlaceholder: "Ring Road corner, near the water booth",
  detailsPlaceholder:
    "Obstruction, foul odour, fire risk, or repeated dumping at this spot.",
  submitLabel: "Analyse report",
};

export default function GarbageReportingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Report garbage"
        description="Submit a photograph and location. CivicBridge classifies the waste, scores its urgency, and drafts a notice to the responsible authority — which you review before anything is sent."
      />

      <IssueReportWizard track={GARBAGE_TRACK} />
    </div>
  );
}
