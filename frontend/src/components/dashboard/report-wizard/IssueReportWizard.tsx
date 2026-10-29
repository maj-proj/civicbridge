"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Crosshair,
  MapPin,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityScore } from "@/components/dashboard/PriorityBadge";
import {
  CompositionBars,
  ScoreFactors,
} from "@/components/dashboard/ReportInsights";
import { Stepper, type Step } from "./Stepper";
import { AnalysisProgress } from "./AnalysisProgress";
import { NoticePreparing, NoticeStep } from "./NoticeStep";
import type {
  DeliveryResult,
  EmailDraft,
  IssueTrackConfig,
  SubmitResponse,
} from "./types";

export type { IssueTrackConfig } from "./types";

const STEPS: Step[] = [
  { id: 1, label: "Report", hint: "Photograph and location" },
  { id: 2, label: "Analysis", hint: "Detection and priority" },
  { id: 3, label: "Notice", hint: "Review before sending" },
  { id: 4, label: "Sent", hint: "Delivery confirmed" },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

type Phase =
  | "form"
  | "analysing"
  | "analysed"
  | "preparing"
  | "notice"
  | "sent";

const STEP_FOR_PHASE: Record<Phase, number> = {
  form: 1,
  analysing: 2,
  analysed: 2,
  preparing: 3,
  notice: 3,
  sent: 4,
};

export function IssueReportWizard({ track }: { track: IssueTrackConfig }) {
  const [phase, setPhase] = useState<Phase>("form");

  // step 1
  const [classification, setClassification] = useState(
    track.defaultClassification
  );
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // step 2
  const [result, setResult] = useState<SubmitResponse | null>(null);

  // step 3
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // step 4
  const [delivery, setDelivery] = useState<DeliveryResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasCoords = latitude.trim() !== "" && longitude.trim() !== "";

  const handleFile = useCallback((selected: File | null) => {
    setFormError(null);

    if (!selected) {
      setFile(null);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      return;
    }

    if (!ACCEPTED.includes(selected.type)) {
      setFormError("Please choose a JPG, PNG or WebP image.");
      return;
    }

    if (selected.size > MAX_FILE_BYTES) {
      setFormError("That image is larger than 10MB. Please choose a smaller file.");
      return;
    }

    setFile(selected);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(selected);
    });
  }, []);

  const captureLocation = useCallback(() => {
    setGeoError(null);

    if (!("geolocation" in navigator)) {
      setGeoError(
        "This browser cannot provide a location. Enter coordinates manually."
      );
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enter the coordinates manually."
            : "Could not determine your location. Enter the coordinates manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!file) {
      setFormError(track.photoRequiredError);
      return;
    }

    setPhase("analysing");

    const form = new FormData();
    form.append("image", file);
    form.append("wasteType", classification);
    form.append("description", description);
    form.append("locationText", locationText);
    if (hasCoords) {
      form.append("latitude", latitude.trim());
      form.append("longitude", longitude.trim());
    }

    try {
      const response = await fetch(track.endpoint, {
        method: "POST",
        body: form,
      });

      const data = (await response.json()) as SubmitResponse;

      if (!response.ok) {
        setFormError(data.error || "Submission failed. Please try again.");
        setPhase("form");
        return;
      }

      setResult(data);
      setPhase("analysed");
    } catch (err) {
      setFormError(
        err instanceof Error
          ? `Could not reach the server: ${err.message}`
          : "Could not reach the server."
      );
      setPhase("form");
    }
  };

  const prepareNotice = async () => {
    const reportId = result?.report.id;
    if (!reportId) return;

    setPhase("preparing");
    setNoticeError(null);

    try {
      const response = await fetch(
        `/api/reports/${reportId}/email?action=prepare`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok) {
        setNoticeError(data.error || "The notice could not be drafted.");
        setPhase("analysed");
        return;
      }

      setDraft(data.draft as EmailDraft);
      setPhase("notice");
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : "The notice could not be drafted."
      );
      setPhase("analysed");
    }
  };

  const sendNotice = async () => {
    const reportId = result?.report.id;
    if (!reportId || !draft) return;

    setSending(true);
    setNoticeError(null);

    try {
      const response = await fetch(`/api/reports/${reportId}/email?action=send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.draftId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setNoticeError(data.error || "The notice could not be sent.");
        return;
      }

      setDelivery(data.delivery as DeliveryResult);
      setPhase("sent");
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : "The notice could not be sent."
      );
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    handleFile(null);
    setClassification(track.defaultClassification);
    setDescription("");
    setLocationText("");
    setLatitude("");
    setLongitude("");
    setResult(null);
    setDraft(null);
    setDelivery(null);
    setFormError(null);
    setNoticeError(null);
    setGeoError(null);
    setPhase("form");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      <Stepper steps={STEPS} current={STEP_FOR_PHASE[phase]} />

      {phase === "form" && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{track.cardTitle}</CardTitle>
            <CardDescription>{track.cardDescription}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="classification">
                    {track.classificationLabel}
                  </FieldLabel>
                  <Select
                    items={track.classifications}
                    value={classification}
                    onValueChange={(value) => setClassification(String(value))}
                  >
                    <SelectTrigger id="classification" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(track.classifications).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FieldDescription>{track.classificationHelp}</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>{track.photoLabel}</FieldLabel>

                  {previewUrl ? (
                    <div className="relative overflow-hidden rounded-xl border">
                      {/* Object URL: next/image cannot optimise a blob. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Selected evidence"
                        className="h-56 w-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => handleFile(null)}
                        aria-label="Remove image"
                        className="absolute top-2 right-2"
                      >
                        <X />
                      </Button>
                      <div className="truncate border-t bg-card px-3 py-2 text-xs text-muted-foreground">
                        {file?.name} ·{" "}
                        {((file?.size ?? 0) / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors hover:border-ring hover:bg-muted/40">
                      <Camera className="size-6 text-muted-foreground" />
                      <div className="text-sm font-medium">
                        Upload or take a photograph
                      </div>
                      <div className="text-xs text-muted-foreground">
                        JPG, PNG or WebP, up to 10MB
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                        aria-label={track.photoLabel}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </div>
                  )}
                </Field>

                <Field>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="latitude">Coordinates</FieldLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={captureLocation}
                      disabled={locating}
                    >
                      {locating ? <Spinner /> : <Crosshair />}
                      {locating ? "Locating" : "Use my location"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="latitude"
                      inputMode="decimal"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="Latitude — 12.911600"
                    />
                    <Input
                      inputMode="decimal"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="Longitude — 77.641200"
                      aria-label="Longitude"
                    />
                  </div>

                  {geoError ? (
                    <FieldDescription className="text-destructive">
                      {geoError}
                    </FieldDescription>
                  ) : (
                    <FieldDescription>
                      Zone scoring and ward routing both need coordinates, not
                      just a landmark name. Without them the report is still
                      saved, but it cannot be escalated or routed.
                    </FieldDescription>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="landmark">Landmark</FieldLabel>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="landmark"
                      value={locationText}
                      onChange={(e) => setLocationText(e.target.value)}
                      placeholder={track.landmarkPlaceholder}
                      className="pl-9"
                    />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="details">Additional details</FieldLabel>
                  <Textarea
                    id="details"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={track.detailsPlaceholder}
                  />
                </Field>

                {formError && (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>{formError}</AlertTitle>
                  </Alert>
                )}

                <Field>
                  <Button type="submit" size="lg">
                    {track.submitLabel}
                    <ArrowRight />
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {phase === "analysing" && (
        <Card>
          <CardContent>
            <AnalysisProgress />
          </CardContent>
        </Card>
      )}

      {phase === "analysed" && result && (
        <AnalysisResult
          result={result}
          error={noticeError}
          onContinue={prepareNotice}
          onReset={reset}
        />
      )}

      {phase === "preparing" && <NoticePreparing />}

      {phase === "notice" && draft && (
        <NoticeStep
          draft={draft}
          sending={sending}
          error={noticeError}
          onBack={() => setPhase("analysed")}
          onRedraft={prepareNotice}
          onSend={sendNotice}
        />
      )}

      {phase === "sent" && delivery && (
        <SentStep
          delivery={delivery}
          reportId={result?.report.id ?? null}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AnalysisResult({
  result,
  error,
  onContinue,
  onReset,
}: {
  result: SubmitResponse;
  error: string | null;
  onContinue: () => void;
  onReset: () => void;
}) {
  const { analysis, priority, report, warnings, sensitivity, persisted } = result;

  // A notice can only be drafted against a saved, scored report.
  const canNotify = persisted && Boolean(report.id) && Boolean(priority);

  // Pothole detections carry a severity; waste detections do not.
  const defects = (analysis?.detections ?? []).filter(
    (
      row
    ): row is (typeof row) & {
      severity_score: number;
      severity_level: "Low" | "Medium" | "High";
    } => typeof row.severity_score === "number" && Boolean(row.severity_level)
  );

  const materialClasses = (analysis?.detections ?? []).filter(
    (row) => typeof row.severity_score !== "number"
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-primary">
                <CheckCircle2 className="size-4" />
                Analysis complete
              </div>
              <CardTitle className="text-lg">{report.title}</CardTitle>
              {report.address && (
                <CardDescription>{report.address}</CardDescription>
              )}
            </div>
            {priority && (
              <PriorityScore label={priority.label} score={priority.score} />
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {report.annotatedImageUrl && (
            <div className="overflow-hidden rounded-xl border">
              {/* Served by the detection service, outside next/image's loader. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.annotatedImageUrl}
                alt="Detection overlay"
                className="w-full object-cover"
              />
              <div className="border-t bg-card px-3 py-2 text-xs text-muted-foreground">
                YOLOv8 detection overlay
              </div>
            </div>
          )}

          {/* Garbage: what the waste is made of. */}
          {analysis && (analysis.category_distribution?.length ?? 0) > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Material composition
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {plural(analysis.image_analysis.total_objects_detected, "object")}
                  {typeof analysis.image_analysis.total_categories_detected ===
                    "number" && (
                    <>
                      {" · "}
                      {plural(
                        analysis.image_analysis.total_categories_detected,
                        "category",
                        "categories"
                      )}
                    </>
                  )}
                </span>
              </h2>
              <CompositionBars rows={analysis.category_distribution ?? []} />
            </section>
          )}

          {/* Potholes: how bad each defect is. */}
          {analysis && defects.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Detected defects
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {plural(defects.length, "defect")}
                  {analysis.image_analysis.worst_severity_level
                    ? ` · worst ${analysis.image_analysis.worst_severity_level.toLowerCase()}`
                    : ""}
                </span>
              </h2>

              <ul className="divide-y divide-border">
                {defects.map((defect, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm">
                      {defect.class}{" "}
                      <span className="text-muted-foreground">#{index + 1}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {defect.confidence.toFixed(0)}% confident
                      </span>
                      <Badge
                        variant="outline"
                        className={severityStyle(defect.severity_level)}
                      >
                        {defect.severity_level} · {defect.severity_score}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {priority && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Why this score</h2>
              <ScoreFactors factors={priority.breakdown.factors} />
            </section>
          )}

          {materialClasses.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Detected classes</h2>
              <div className="flex flex-wrap gap-1.5">
                {materialClasses.map((d) => (
                  <Badge key={d.class} variant="outline">
                    {d.class}
                    <span className="tabular-nums text-muted-foreground">
                      {d.confidence.toFixed(0)}%
                    </span>
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {analysis && analysis.detections.length === 0 && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Nothing was detected in this photograph</AlertTitle>
              <AlertDescription>
                The model returned no objects, so there is no automated
                assessment to send. A human will need to review the image.
              </AlertDescription>
            </Alert>
          )}

          {sensitivity.triggeringPoi && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Escalated for a sensitive location</AlertTitle>
              <AlertDescription>
                {sensitivity.triggeringPoi.distanceMeters}m from{" "}
                {sensitivity.triggeringPoi.name}.
              </AlertDescription>
            </Alert>
          )}

          {warnings.length > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Ran with reduced capability</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-4">
                  {warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>The notice could not be drafted</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!canNotify && (
        <Alert>
          <AlertTitle>No notice can be drafted for this report</AlertTitle>
          <AlertDescription>
            {!persisted
              ? "The report was analysed but not saved, so there is nothing to route."
              : "The report was saved without a priority score, so it will not be routed automatically."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {canNotify && (
          <Button onClick={onContinue}>
            Review the notice
            <ArrowRight />
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>
          <Plus />
          Submit another
        </Button>
        {report.id && (
          <Button
            variant="ghost"
            render={<Link href={`/dashboard/reports/${report.id}`} />}
            nativeButton={false}
          >
            View timeline
          </Button>
        )}
      </div>
    </div>
  );
}

function SentStep({
  delivery,
  reportId,
  onReset,
}: {
  delivery: DeliveryResult;
  reportId: string | null;
  onReset: () => void;
}) {
  const redirected = delivery.actualTo !== delivery.intendedTo;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </span>

          <div className="space-y-1">
            <h2 className="font-heading text-lg font-medium">
              {delivery.status === "DRY_RUN"
                ? "Notice recorded"
                : "Notice sent"}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {delivery.status === "DRY_RUN"
                ? "Dry run mode — the notice was logged against the report, but no email was handed to a provider."
                : redirected
                  ? "Delivered to the sandbox address. The authority it was addressed to is recorded on the report."
                  : "Delivered to the authority."}
            </p>
          </div>

          <dl className="grid w-full max-w-sm gap-x-4 gap-y-2 text-left text-sm sm:grid-cols-[6rem_1fr]">
            <dt className="text-muted-foreground">Addressed to</dt>
            <dd className="font-mono text-xs break-all">{delivery.intendedTo}</dd>

            {redirected && (
              <>
                <dt className="text-muted-foreground">Delivered to</dt>
                <dd className="font-mono text-xs break-all">
                  {delivery.actualTo}
                </dd>
              </>
            )}

            <dt className="text-muted-foreground">Mode</dt>
            <dd>{delivery.mode}</dd>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onReset}>
          <Plus />
          Submit another
        </Button>
        {reportId && (
          <Button
            variant="outline"
            render={<Link href={`/dashboard/reports/${reportId}`} />}
            nativeButton={false}
          >
            View timeline
          </Button>
        )}
      </div>
    </div>
  );
}

/** Severity chips reuse the priority ramp so the colours mean one thing. */
function severityStyle(level: "Low" | "Medium" | "High"): string {
  if (level === "High") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-border bg-muted text-muted-foreground";
}

function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
