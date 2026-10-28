import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  IssueReportWizard,
  type IssueTrackConfig,
} from "@/components/dashboard/report-wizard/IssueReportWizard";

const POTHOLE_TRACK: IssueTrackConfig = {
  endpoint: "/api/reports/pothole",
  cardTitle: "Defect details",
  cardDescription:
    "Photographic evidence and coordinates drive the assessment and routing.",
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
    "A photograph is required — the report is reviewed from the image.",
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
        description="Submit a photograph and location of a road defect. The report is geocoded and logged, and you review the notice before it reaches the ward office."
      />

      <Alert>
        <TriangleAlert />
        <AlertTitle>Automated scoring is not available for potholes yet</AlertTitle>
        <AlertDescription>
          The trained model recognises ten categories of waste and cannot detect
          road defects. Submissions are captured, geocoded, stored and routed
          like any other report, but they will not receive a meaningful priority
          score until a pothole model is trained.
        </AlertDescription>
      </Alert>

      <IssueReportWizard track={POTHOLE_TRACK} />
    </div>
  );
}
