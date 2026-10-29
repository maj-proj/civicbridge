import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  IssueReportWizard,
  type IssueTrackConfig,
} from "@/components/dashboard/report-wizard/IssueReportWizard";

const POTHOLE_TRACK: IssueTrackConfig = {
  endpoint: "/api/reports/pothole",
  cardTitle: "Defect details",
  cardDescription:
    "Photographic evidence and coordinates drive the automated assessment.",
  classificationLabel: "Defect type",
  classificationHelp:
    "Your assessment. Recorded on the report for the reviewing engineer.",
  classifications: {
    pothole: "Pothole",
    crack: "Surface cracking",
    subsidence: "Subsidence / sinking",
    erosion: "Edge erosion",
    manhole: "Sunken or raised manhole",
  },
  defaultClassification: "pothole",
  photoLabel: "Photograph",
  photoRequiredError:
    "A photograph is required — the assessment runs on the image.",
  landmarkPlaceholder: "Outer Ring Road, 200m before the flyover",
  detailsPlaceholder:
    "Approximate width and depth, standing water, traffic hazard, or how long it has been there.",
  submitLabel: "Analyse report",
};

export default function PotholeReportingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Report a pothole"
        description="Submit a photograph and location of a road defect. CivicBridge measures each defect, scores its urgency, and drafts a notice to the responsible ward office — which you review before anything is sent."
      />

      <IssueReportWizard track={POTHOLE_TRACK} />
    </div>
  );
}
