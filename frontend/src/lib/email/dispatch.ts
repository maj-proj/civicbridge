/**
 * Ties routing, composition and delivery together, and records what happened.
 *
 * Delivery is deliberately split in two. `prepareReportEmail` resolves the
 * authority and drafts the notice; `sendPreparedEmail` is what actually hands
 * it to a provider. Nothing reaches a municipal inbox without the reporter
 * seeing the exact text first and asking for it to go.
 *
 * Every send writes to the same EmailLog row the draft created, so the audit
 * trail records what was approved and what was ultimately delivered — which
 * differ in sandbox mode, where the genuine recipient survives only here.
 */

import type { CivicReport } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { resolveAuthority } from "@/lib/routing/resolveAuthority";
import { composeAuthorityEmail } from "./composeEmail";
import { previewDelivery, sendAuthorityEmail } from "./send";
import { ensurePublicOverlay } from "@/lib/reports/publicOverlay";
import type {
  PriorityLabel,
  ScoreBreakdown,
} from "@/lib/priority/computePriority";
import type { CategoryDistributionRow } from "@/lib/types/detection";

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
  /** Delivery preview — not yet performed. */
  mode: string;
  deliverTo: string;
  redirected: boolean;
  blocker: string | null;
}

export type PrepareResult =
  | { ok: true; draft: EmailDraft }
  | { ok: false; error: string };

export type SendResult =
  | {
      ok: true;
      status: string;
      mode: string;
      actualTo: string;
      intendedTo: string;
      providerMessageId?: string;
    }
  | { ok: false; error: string };

async function loadScoredReport(
  reportId: string
): Promise<{ report: CivicReport } | { error: string }> {
  if (!isDatabaseConfigured()) return { error: "Database not configured." };

  let report: CivicReport | null = null;

  try {
    report = await prisma.civicReport.findUnique({ where: { id: reportId } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  if (!report) return { error: "Report not found." };

  if (report.priorityLabel === null) {
    return {
      error: "Report has not been scored; not routing an unassessed incident.",
    };
  }

  return { report };
}

/**
 * Resolves the authority, drafts the notice, and parks it as a DRAFT EmailLog
 * row. Sends nothing.
 */
export async function prepareReportEmail(
  reportId: string
): Promise<PrepareResult> {
  const loaded = await loadScoredReport(reportId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const { report } = loaded;

  // Last chance to get the overlay onto a public address: the notice embeds
  // the image, and a host-local URL renders as a broken image for whoever
  // receives it. Mirroring normally happened at submission; this covers the
  // case where that failed or had not finished.
  const annotatedImageUrl = await ensurePublicOverlay(report);

  const categoryDistribution =
    (report.categoryDistribution as unknown as CategoryDistributionRow[]) ?? [];

  const dominantCategory =
    [...categoryDistribution].sort((a, b) => b.percentage - a.percentage)[0]
      ?.category ?? null;

  const nearbyZoneTypes = Array.isArray(report.nearbyPois)
    ? (report.nearbyPois as Array<{ type?: string }>)
        .map((poi) => poi?.type)
        .filter((type): type is string => typeof type === "string")
    : [];

  const routing = await resolveAuthority({
    latitude: report.latitude,
    longitude: report.longitude,
    wardName: report.wardName,
    city: report.city,
    dominantCategory: report.type === "GARBAGE" ? dominantCategory : null,
    reportType: report.type,
    priorityLabel: report.priorityLabel as PriorityLabel,
    nearbyZoneTypes,
  });

  if (!routing.authority) {
    return { ok: false, error: routing.rationale.join(" ") };
  }

  const composed = await composeAuthorityEmail({
    reportId: report.id,
    reportType: report.type,
    authorityName: routing.authority.name,
    authorityDesignation: routing.authority.designation,
    wardName: report.wardName,
    address: report.address,
    latitude: report.latitude,
    longitude: report.longitude,
    reportedAt: report.createdAt,
    priorityScore: report.priorityScore ?? 0,
    priorityLabel: report.priorityLabel as PriorityLabel,
    breakdown: ((report.scoreBreakdown as unknown as ScoreBreakdown) ?? {
      factors: [],
      summary: [],
    }) as ScoreBreakdown,
    totalObjects: report.totalObjects ?? 0,
    categoryDistribution,
    imageUrl: report.imageUrl,
    annotatedImageUrl,
    citizenDescription: report.description,
    routingRationale: routing.rationale,
  });

  const delivery = previewDelivery(routing.authority.email);

  try {
    // Re-drafting replaces any earlier unsent draft, so a reporter can never
    // approve one version and have a stale one sent.
    await prisma.emailLog.deleteMany({
      where: { reportId: report.id, status: "DRAFT" },
    });

    const draft = await prisma.emailLog.create({
      data: {
        reportId: report.id,
        intendedTo: routing.authority.email,
        actualTo: delivery.deliverTo,
        ccEmails: routing.ccEmails,
        subject: composed.subject,
        body: composed.body,
        bodyHtml: composed.bodyHtml,
        mode: delivery.mode,
        status: "DRAFT",
      },
    });

    // The authority is settled at draft time; the report is only marked
    // ROUTED once the notice is actually approved and sent.
    await prisma.civicReport.update({
      where: { id: report.id },
      data: { authorityId: routing.authority.id },
    });

    return {
      ok: true,
      draft: {
        draftId: draft.id,
        authorityName: routing.authority.name,
        authorityDesignation: routing.authority.designation,
        intendedTo: routing.authority.email,
        ccEmails: routing.ccEmails,
        subject: composed.subject,
        body: composed.body,
        bodyHtml: composed.bodyHtml,
        routingRationale: routing.rationale,
        aiGenerated: composed.aiGenerated,
        slaHours: composed.suggestedSlaHours,
        mode: delivery.mode,
        deliverTo: delivery.deliverTo,
        redirected: delivery.redirected,
        blocker: delivery.blocker,
      },
    };
  } catch (error) {
    console.error("Failed to store email draft:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sends the draft the reporter approved — exactly the text they were shown,
 * read back from the database rather than accepted from the client.
 */
export async function sendPreparedEmail(
  reportId: string,
  draftId?: string
): Promise<SendResult> {
  const loaded = await loadScoredReport(reportId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const { report } = loaded;

  const draft = await prisma.emailLog.findFirst({
    where: {
      reportId: report.id,
      status: "DRAFT",
      ...(draftId ? { id: draftId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!draft) {
    return {
      ok: false,
      error:
        "No approved draft was found for this report. Prepare the notice again.",
    };
  }

  const outcome = await sendAuthorityEmail({
    to: draft.intendedTo,
    cc: draft.ccEmails,
    subject: draft.subject,
    body: draft.body,
    bodyHtml: draft.bodyHtml,
  });

  try {
    await prisma.emailLog.update({
      where: { id: draft.id },
      data: {
        actualTo: outcome.actualTo,
        subject: outcome.subject,
        body: outcome.body,
        bodyHtml: outcome.bodyHtml,
        mode: outcome.mode,
        status: outcome.status,
        providerMessageId: outcome.providerMessageId,
        error: outcome.error,
        sentAt: outcome.status === "SENT" ? new Date() : null,
      },
    });

    // DRY_RUN still counts as routed: the authority was resolved and the
    // message composed. Only a delivery failure leaves the report unrouted.
    if (outcome.status !== "FAILED") {
      await prisma.civicReport.update({
        where: { id: report.id },
        data: { status: "ROUTED", routedAt: new Date() },
      });

      await prisma.reportStatusEvent.create({
        data: {
          reportId: report.id,
          fromStatus: report.status,
          toStatus: "ROUTED",
          actor: report.anonymousId ?? "citizen",
          note:
            `Notice approved by the reporter and sent to ${draft.intendedTo} ` +
            `in ${outcome.mode} mode.`,
        },
      });
    }
  } catch (error) {
    console.error("Failed to record email dispatch:", error);
  }

  if (outcome.status === "FAILED") {
    return { ok: false, error: outcome.error ?? "Delivery failed." };
  }

  return {
    ok: true,
    status: outcome.status,
    mode: outcome.mode,
    actualTo: outcome.actualTo,
    intendedTo: draft.intendedTo,
    providerMessageId: outcome.providerMessageId,
  };
}
