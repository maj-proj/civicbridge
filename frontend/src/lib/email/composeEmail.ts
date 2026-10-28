/**
 * Drafts the authority notification with Groq (free tier, OpenAI-compatible).
 *
 * The model writes prose into fixed slots; it never writes the structure,
 * the figures, or the deadline. That is deliberate — an AI-written complaint
 * to a municipal office must not be able to invent a statute, a penalty or a
 * legal obligation that does not exist. Every number in the final email
 * comes from the detection payload and the priority breakdown, and when the
 * model is unavailable the deterministic template below is used instead.
 */

import type { PriorityLabel, ScoreBreakdown } from "@/lib/priority/computePriority";
import { PRIORITY_LABEL_TEXT } from "@/lib/priority/computePriority";
import type { CategoryDistributionRow } from "@/lib/types/detection";

export interface ComposeInput {
  reportId: string;
  /** CivicReport.type — decides the wording and whether a material breakdown applies. */
  reportType: string;
  authorityName: string;
  authorityDesignation?: string | null;
  wardName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reportedAt: Date;
  priorityScore: number;
  priorityLabel: PriorityLabel;
  breakdown: ScoreBreakdown;
  totalObjects: number;
  categoryDistribution: CategoryDistributionRow[];
  imageUrl?: string | null;
  annotatedImageUrl?: string | null;
  citizenDescription?: string | null;
  routingRationale: string[];
}

export interface ComposedEmail {
  subject: string;
  /** Plain-text part, and what the approval screen and audit trail record. */
  body: string;
  /** HTML part — same content, with the evidence shown rather than linked. */
  bodyHtml: string;
  suggestedSlaHours: number;
  /** False when the deterministic fallback was used. */
  aiGenerated: boolean;
}

/** Response-time guidance by band. Ours, not the model's. */
const SLA_HOURS: Record<PriorityLabel, number> = {
  VERY_HIGH: 12,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168,
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TIMEOUT_MS = 15_000;

/**
 * Per-track wording. Without this a pothole report reaches a ward engineer
 * under the subject "Waste accumulation reported at ...", describing a
 * material composition that the waste model invented from a road photograph.
 */
interface IssueCopy {
  /** Sentence-case noun used mid-sentence. */
  noun: string;
  /** Title-case noun used to open a subject line. */
  subjectNoun: string;
  /** How the track is described to the drafting model. */
  promptNoun: string;
  ask: string;
  /** Whether the object count and material breakdown are meaningful. */
  showComposition: boolean;
  /** Appended to the assessment block when detection does not cover this track. */
  caveat?: string;
}

const ISSUE_COPY: Record<string, IssueCopy> = {
  GARBAGE: {
    noun: "waste accumulation",
    subjectNoun: "Waste accumulation",
    promptNoun: "civic waste report",
    ask:
      "We request an inspection and clearance of the site at your earliest " +
      "convenience. Please reply to this message with an acknowledgement or a " +
      "status update so the report can be tracked to closure.",
    showComposition: true,
  },
  POTHOLE: {
    noun: "road surface defect",
    subjectNoun: "Road surface defect",
    promptNoun: "civic road defect report",
    ask:
      "We request a site inspection and repair at your earliest convenience. " +
      "Please reply to this message with an acknowledgement or a status update " +
      "so the report can be tracked to closure.",
    showComposition: false,
    caveat:
      "No automated defect measurement is available for road reports. The " +
      "priority shown is provisional and the photograph requires assessment " +
      "by an engineer.",
  },
};

function copyFor(reportType: string): IssueCopy {
  return ISSUE_COPY[reportType] ?? ISSUE_COPY.GARBAGE;
}

function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY;
  return Boolean(key && key.trim() && !key.toLowerCase().includes("your_"));
}

function formatLocation(input: ComposeInput): string {
  const parts: string[] = [];
  if (input.address) parts.push(input.address);
  else if (input.wardName) parts.push(input.wardName);
  if (input.latitude != null && input.longitude != null) {
    parts.push(`(${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)})`);
  }
  return parts.join(" ") || "Location not specified";
}

function formatComposition(rows: CategoryDistributionRow[]): string {
  if (rows.length === 0) return "No material breakdown available.";
  return rows
    .map(
      (row) =>
        `  - ${row.category}: ${row.object_count} items (${row.percentage.toFixed(
          1
        )}%)`
    )
    .join("\n");
}

/**
 * The fixed skeleton. The AI fills `openingParagraph` and `closingParagraph`;
 * everything else is generated from data.
 */
function renderBody(
  input: ComposeInput,
  openingParagraph: string,
  closingParagraph: string
): string {
  const slaHours = SLA_HOURS[input.priorityLabel];
  const copy = copyFor(input.reportType);
  const mapsLink =
    input.latitude != null && input.longitude != null
      ? `https://www.google.com/maps?q=${input.latitude},${input.longitude}`
      : null;

  const lines: Array<string | null> = [
    `To: ${input.authorityName}`,
    input.authorityDesignation ? `Attn: ${input.authorityDesignation}` : null,
    "",
    openingParagraph,
    "",
    "INCIDENT DETAILS",
    `  Reference ID    : ${input.reportId}`,
    `  Reported at     : ${input.reportedAt.toISOString()}`,
    `  Location        : ${formatLocation(input)}`,
    input.wardName ? `  Ward            : ${input.wardName}` : null,
    mapsLink ? `  Map             : ${mapsLink}` : null,
    "",
    "AUTOMATED ASSESSMENT",
    `  Priority        : ${PRIORITY_LABEL_TEXT[input.priorityLabel]} (${input.priorityScore}/100)`,
    copy.showComposition ? `  Objects detected: ${input.totalObjects}` : null,
    `  Suggested SLA   : ${slaHours} hours`,
    "",
    copy.caveat ? `  Note: ${copy.caveat}` : null,
    copy.caveat ? "" : null,
    copy.showComposition ? "  Material composition:" : null,
    copy.showComposition ? formatComposition(input.categoryDistribution) : null,
    copy.showComposition ? "" : null,
    // The scoring factors are phrased in terms of waste volume and material
    // severity, so they are only meaningful on the track the model serves.
    copy.showComposition ? "  Scoring factors:" : null,
    ...(copy.showComposition
      ? input.breakdown.factors.map(
          (factor) => `  - ${factor.label}: ${factor.detail}`
        )
      : []),
    copy.showComposition ? "" : null,
  ];

  if (input.citizenDescription?.trim()) {
    lines.push("CITIZEN DESCRIPTION", `  ${input.citizenDescription.trim()}`, "");
  }

  if (input.imageUrl || input.annotatedImageUrl) {
    lines.push("EVIDENCE");
    if (input.imageUrl) lines.push(`  Photograph      : ${input.imageUrl}`);
    if (input.annotatedImageUrl) {
      lines.push(`  Detection overlay: ${input.annotatedImageUrl}`);
    }
    lines.push("");
  }

  if (input.routingRationale.length > 0) {
    lines.push("ROUTING");
    lines.push(...input.routingRationale.map((reason) => `  - ${reason}`));
    lines.push("");
  }

  lines.push(closingParagraph, "", "—", "Sent via CivicBridge");
  lines.push(
    "This assessment was produced automatically from a citizen-submitted",
    "photograph using an image classification model. The priority score is",
    "advisory and should be confirmed by site inspection."
  );

  return lines.filter((line) => line !== null).join("\n");
}

/** Everything interpolated into the HTML part passes through this first. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Only https images are embedded. An unreachable src renders as a broken
 * image in the recipient's client, which is worse than an honest note saying
 * the evidence could not be published.
 */
function embeddableImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("https://") ? url : null;
}

const LABEL =
  "color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;";
const CELL = "padding:6px 0;font-size:14px;color:#0f172a;";

function htmlRow(label: string, value: string): string {
  return `<tr><td style="${CELL}width:150px;color:#64748b;">${esc(
    label
  )}</td><td style="${CELL}">${value}</td></tr>`;
}

function figure(src: string, caption: string, note?: string): string {
  return `
      <div style="margin:0 0 16px;">
        <img src="${esc(src)}" alt="${esc(caption)}" width="560"
             style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #e2e8f0;border-radius:8px;" />
        <div style="margin-top:6px;font-size:12px;color:#64748b;">${esc(
          caption
        )}${note ? ` — ${esc(note)}` : ""}</div>
      </div>`;
}

/**
 * The HTML part. Same structure and the same figures as the text part, but
 * the evidence is rendered inline instead of pasted as a URL. Table layout
 * and inline styles throughout, because email clients are not browsers.
 */
function renderHtmlBody(
  input: ComposeInput,
  openingParagraph: string,
  closingParagraph: string
): string {
  const copy = copyFor(input.reportType);
  const slaHours = SLA_HOURS[input.priorityLabel];
  const mapsLink =
    input.latitude != null && input.longitude != null
      ? `https://www.google.com/maps?q=${input.latitude},${input.longitude}`
      : null;

  const photo = embeddableImage(input.imageUrl);
  const overlay = embeddableImage(input.annotatedImageUrl);
  const unpublished =
    (input.imageUrl && !photo) || (input.annotatedImageUrl && !overlay);

  const composition =
    copy.showComposition && input.categoryDistribution.length > 0
      ? input.categoryDistribution
          .map(
            (row) =>
              `<li style="margin:2px 0;">${esc(row.category)} — ${
                row.object_count
              } items (${row.percentage.toFixed(1)}%)</li>`
          )
          .join("")
      : "";

  const factors = copy.showComposition
    ? input.breakdown.factors
        .map(
          (factor) =>
            `<li style="margin:4px 0;"><strong>${esc(
              factor.label
            )}:</strong> ${esc(factor.detail)}</li>`
        )
        .join("")
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
    <tr><td style="padding:24px;">

      <div style="${LABEL}">${esc(
        PRIORITY_LABEL_TEXT[input.priorityLabel]
      )} priority · ${input.priorityScore}/100</div>
      <h1 style="margin:4px 0 16px;font-size:18px;color:#0f172a;">${esc(
        copy.subjectNoun
      )} — ${esc(input.wardName ?? formatLocation(input))}</h1>

      <p style="margin:0 0 6px;font-size:14px;color:#0f172a;">To: ${esc(
        input.authorityName
      )}</p>
      ${
        input.authorityDesignation
          ? `<p style="margin:0 0 16px;font-size:14px;color:#64748b;">Attn: ${esc(
              input.authorityDesignation
            )}</p>`
          : ""
      }

      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#0f172a;">${esc(
        openingParagraph
      )}</p>

      <div style="${LABEL}margin-bottom:4px;">Incident details</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        ${htmlRow("Reference ID", esc(input.reportId))}
        ${htmlRow("Reported at", esc(input.reportedAt.toISOString()))}
        ${htmlRow("Location", esc(formatLocation(input)))}
        ${input.wardName ? htmlRow("Ward", esc(input.wardName)) : ""}
        ${
          mapsLink
            ? htmlRow(
                "Map",
                `<a href="${esc(
                  mapsLink
                )}" style="color:#047857;">Open in Google Maps</a>`
              )
            : ""
        }
      </table>

      <div style="${LABEL}margin-bottom:4px;">Automated assessment</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
        ${htmlRow(
          "Priority",
          `${esc(PRIORITY_LABEL_TEXT[input.priorityLabel])} (${
            input.priorityScore
          }/100)`
        )}
        ${
          copy.showComposition
            ? htmlRow("Objects detected", String(input.totalObjects))
            : ""
        }
        ${htmlRow("Suggested SLA", `${slaHours} hours`)}
      </table>

      ${
        copy.caveat
          ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;line-height:1.5;color:#92400e;">${esc(
              copy.caveat
            )}</p>`
          : ""
      }

      ${
        composition
          ? `<div style="${LABEL}margin-bottom:4px;">Material composition</div>
             <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;color:#0f172a;">${composition}</ul>`
          : ""
      }

      ${
        factors
          ? `<div style="${LABEL}margin-bottom:4px;">Scoring factors</div>
             <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.5;color:#0f172a;">${factors}</ul>`
          : ""
      }

      ${
        input.citizenDescription?.trim()
          ? `<div style="${LABEL}margin-bottom:4px;">Citizen description</div>
             <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#0f172a;">${esc(
               input.citizenDescription.trim()
             )}</p>`
          : ""
      }

      ${
        photo || overlay
          ? `<div style="${LABEL}margin-bottom:8px;">Evidence</div>
             ${photo ? figure(photo, "Citizen photograph") : ""}
             ${
               overlay
                 ? figure(
                     overlay,
                     "Automated detection overlay",
                     "boxes drawn by the model"
                   )
                 : ""
             }`
          : ""
      }

      ${
        unpublished
          ? `<p style="margin:0 0 20px;font-size:13px;color:#64748b;">Some evidence images could not be published to a public address and are therefore not shown here.</p>`
          : ""
      }

      ${
        input.routingRationale.length > 0
          ? `<div style="${LABEL}margin-bottom:4px;">Routing</div>
             <ul style="margin:0 0 20px;padding-left:18px;font-size:13px;line-height:1.5;color:#64748b;">${input.routingRationale
               .map((reason) => `<li style="margin:2px 0;">${esc(reason)}</li>`)
               .join("")}</ul>`
          : ""
      }

      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#0f172a;">${esc(
        closingParagraph
      )}</p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 12px;" />
      <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
        Sent via CivicBridge. This assessment was produced automatically from a
        citizen-submitted photograph using an image classification model. The
        priority score is advisory and should be confirmed by site inspection.
      </p>

    </td></tr>
  </table>
</body></html>`;
}

function fallbackCompose(input: ComposeInput): ComposedEmail {
  const label = PRIORITY_LABEL_TEXT[input.priorityLabel];
  const copy = copyFor(input.reportType);

  const opening =
    `A ${copy.noun} has been reported at ${formatLocation(input)} ` +
    `and automatically assessed as ${label} priority. We are forwarding the ` +
    `details below for your review and appropriate action.`;

  const closing = copy.ask;

  return {
    subject: `[${label} Priority] ${copy.subjectNoun} reported at ${
      input.wardName ?? formatLocation(input)
    } — Ref ${input.reportId.slice(0, 8)}`,
    body: renderBody(input, opening, closing),
    bodyHtml: renderHtmlBody(input, opening, closing),
    suggestedSlaHours: SLA_HOURS[input.priorityLabel],
    aiGenerated: false,
  };
}

interface GroqSlots {
  subject?: unknown;
  openingParagraph?: unknown;
  closingParagraph?: unknown;
}

export async function composeAuthorityEmail(
  input: ComposeInput
): Promise<ComposedEmail> {
  if (!isGroqConfigured()) return fallbackCompose(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const copy = copyFor(input.reportType);

    const facts = {
      issue: copy.noun,
      priority: PRIORITY_LABEL_TEXT[input.priorityLabel],
      score: input.priorityScore,
      location: formatLocation(input),
      ward: input.wardName ?? "unknown",
      authority: input.authorityName,
      citizenNote: input.citizenDescription ?? null,
      // Object counts and material categories come from the waste model, so
      // they are only shown to the drafting model on tracks it actually covers.
      // keyFindings is written by the waste scorer ("2 objects covering 41% of
      // the frame"), so withholding it stops the drafting model describing a
      // road defect in terms of plastic items.
      ...(copy.showComposition
        ? {
            objects: input.totalObjects,
            composition: input.categoryDistribution.map(
              (row) => `${row.category} ${row.percentage.toFixed(0)}%`
            ),
            keyFindings: input.breakdown.summary,
          }
        : {
            detectionAvailable: false,
            note: copy.caveat,
            instruction:
              "Do not describe the contents of the photograph; no detection " +
              "data is available for this report.",
          }),
    };

    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You draft formal civic complaint correspondence to Indian municipal authorities.",
              "You are given verified facts. Write ONLY the prose paragraphs requested.",
              "",
              "Hard rules:",
              "- Never invent statistics, dates, penalties, statutes, acts, section numbers or legal obligations.",
              "- Never state a deadline; the system supplies the SLA separately.",
              "- Never claim the sender has authority to compel action.",
              "- Use only the facts provided. If a fact is absent, omit it.",
              "- Tone: courteous, factual, administrative. No outrage, no adjectives of alarm.",
              "- British/Indian English. Two to four sentences per paragraph.",
              "",
              'Respond with JSON only: {"subject": string, "openingParagraph": string, "closingParagraph": string}',
              "The subject must be under 120 characters and state priority, issue and locality.",
            ].join("\n"),
          },
          {
            role: "user",
            content:
              "Draft the opening and closing paragraphs, and a subject line, " +
              `for this ${copy.promptNoun}. Verified facts as JSON:\n\n` +
              JSON.stringify(facts, null, 2),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(
        `Groq composition failed (${response.status}), using template.`,
        await response.text().catch(() => "")
      );
      return fallbackCompose(input);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallbackCompose(input);

    let slots: GroqSlots;
    try {
      slots = JSON.parse(content) as GroqSlots;
    } catch {
      console.warn("Groq returned non-JSON content, using template.");
      return fallbackCompose(input);
    }

    const template = fallbackCompose(input);

    const subject =
      typeof slots.subject === "string" && slots.subject.trim().length > 0
        ? slots.subject.trim().slice(0, 150)
        : template.subject;

    const opening =
      typeof slots.openingParagraph === "string" &&
      slots.openingParagraph.trim().length > 0
        ? slots.openingParagraph.trim()
        : null;

    const closing =
      typeof slots.closingParagraph === "string" &&
      slots.closingParagraph.trim().length > 0
        ? slots.closingParagraph.trim()
        : null;

    // If either slot came back empty, fall back wholesale rather than
    // shipping a half-written letter.
    if (!opening || !closing) return template;

    return {
      subject,
      body: renderBody(input, opening, closing),
      bodyHtml: renderHtmlBody(input, opening, closing),
      suggestedSlaHours: SLA_HOURS[input.priorityLabel],
      aiGenerated: true,
    };
  } catch (error) {
    console.warn("Groq composition error, using template:", error);
    return fallbackCompose(input);
  } finally {
    clearTimeout(timer);
  }
}
