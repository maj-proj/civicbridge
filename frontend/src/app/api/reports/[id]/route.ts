/**
 * GET   /api/reports/[id] — full report, lifecycle timeline and email audit.
 * PATCH /api/reports/[id] — advance the lifecycle status.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ReportStatus } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_VALUES: ReportStatus[] = [
  "SUBMITTED",
  "ANALYZING",
  "VERIFIED",
  "ROUTED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const report = await prisma.civicReport.findUnique({
      where: { id },
      include: {
        authority: true,
        statusEvents: { orderBy: { createdAt: "asc" } },
        emails: {
          orderBy: { createdAt: "desc" },
          // The composed body can be long; the detail page only needs to
          // prove what was sent, where, and whether it landed.
          select: {
            id: true,
            intendedTo: true,
            actualTo: true,
            ccEmails: true,
            subject: true,
            mode: true,
            status: true,
            error: true,
            sentAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Failed to load report:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  let body: { status?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const nextStatus = body.status;

  if (
    typeof nextStatus !== "string" ||
    !STATUS_VALUES.includes(nextStatus as ReportStatus)
  ) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUS_VALUES.join(", ")}` },
      { status: 400 }
    );
  }

  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  try {
    const existing = await prisma.civicReport.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    if (existing.status === nextStatus) {
      return NextResponse.json({
        report: { id, status: existing.status },
        changed: false,
      });
    }

    const [updated] = await prisma.$transaction([
      prisma.civicReport.update({
        where: { id },
        data: {
          status: nextStatus as ReportStatus,
          ...(nextStatus === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        },
      }),
      prisma.reportStatusEvent.create({
        data: {
          reportId: id,
          fromStatus: existing.status,
          toStatus: nextStatus as ReportStatus,
          note,
          actor: "operator",
        },
      }),
    ]);

    return NextResponse.json({ report: updated, changed: true });
  } catch (error) {
    console.error("Failed to update report status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
