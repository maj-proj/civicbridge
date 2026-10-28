/**
 * GET /api/reports — the shared read model behind the reports list and the
 * public feed.
 *
 * Query parameters:
 *   priority  LOW | MEDIUM | HIGH | VERY_HIGH   (repeatable, comma separated)
 *   status    any ReportStatus                  (repeatable, comma separated)
 *   sort      priority | recent                 (default: priority)
 *   limit     1-100                             (default: 50)
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;
const STATUS_VALUES = [
  "SUBMITTED",
  "ANALYZING",
  "VERIFIED",
  "ROUTED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
] as const;

function parseList<T extends string>(
  raw: string | null,
  allowed: readonly T[]
): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is T => (allowed as readonly string[]).includes(value));
}

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      reports: [],
      total: 0,
      message: "DATABASE_URL is not configured, so no reports can be listed.",
    });
  }

  const params = req.nextUrl.searchParams;

  const priorities = parseList(params.get("priority"), PRIORITY_VALUES);
  const statuses = parseList(params.get("status"), STATUS_VALUES);
  const sort = params.get("sort") === "recent" ? "recent" : "priority";

  const limitRaw = Number(params.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

  const where: Prisma.CivicReportWhereInput = {
    ...(priorities.length > 0 ? { priorityLabel: { in: priorities } } : {}),
    ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
  };

  const orderBy: Prisma.CivicReportOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ createdAt: "desc" }]
      : [{ priorityScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  try {
    const [reports, total] = await Promise.all([
      prisma.civicReport.findMany({
        where,
        orderBy,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          imageUrl: true,
          annotatedImageUrl: true,
          address: true,
          wardName: true,
          latitude: true,
          longitude: true,
          priorityScore: true,
          priorityLabel: true,
          totalObjects: true,
          categoryDistribution: true,
          createdAt: true,
          routedAt: true,
          authority: { select: { name: true, department: true } },
        },
      }),
      prisma.civicReport.count({ where }),
    ]);

    return NextResponse.json({ configured: true, reports, total });
  } catch (error) {
    console.error("Failed to list reports:", error);
    return NextResponse.json(
      {
        configured: true,
        reports: [],
        total: 0,
        error:
          "Could not read reports. Run 'npx prisma migrate dev' if the schema " +
          "has not been applied yet.",
      },
      { status: 500 }
    );
  }
}
