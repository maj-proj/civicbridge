/**
 * Server-side read model for reports.
 *
 * The dashboard pages are server components and call these directly; the
 * /api/reports routes exist for client-side and external consumers. Both go
 * through the same filter and ordering rules defined here.
 */

import "server-only";

import type { Prisma, PriorityLabel, ReportStatus } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const PRIORITY_VALUES: PriorityLabel[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
];

export type ReportSort = "priority" | "recent";

export interface ListOptions {
  priority?: PriorityLabel | null;
  statuses?: ReportStatus[];
  sort?: ReportSort;
  limit?: number;
  /** Filter reports to those created by the given anonymousId (session) */
  reporterId?: string | null;
}

export interface ListResult {
  configured: boolean;
  reports: ReportListItem[];
  total: number;
  error: string | null;
}

const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  anonymousId: true,
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
  createdAt: true,
  routedAt: true,
  authority: { select: { name: true, department: true } },
} satisfies Prisma.CivicReportSelect;

export type ReportListItem = Prisma.CivicReportGetPayload<{
  select: typeof LIST_SELECT;
}>;

export function parsePriority(raw: string | undefined): PriorityLabel | null {
  if (!raw) return null;
  const upper = raw.toUpperCase() as PriorityLabel;
  return PRIORITY_VALUES.includes(upper) ? upper : null;
}

export function parseSort(raw: string | undefined): ReportSort {
  return raw === "recent" ? "recent" : "priority";
}

export async function listReports(
  options: ListOptions = {}
): Promise<ListResult> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      reports: [],
      total: 0,
      error: "DATABASE_URL is not configured, so no reports can be listed.",
    };
  }

  const where: Prisma.CivicReportWhereInput = {
    ...(options.priority ? { priorityLabel: options.priority } : {}),
    ...(options.statuses && options.statuses.length > 0
      ? { status: { in: options.statuses } }
      : {}),
    ...(options.reporterId ? { anonymousId: options.reporterId } : {}),
  };

  const orderBy: Prisma.CivicReportOrderByWithRelationInput[] =
    options.sort === "recent"
      ? [{ createdAt: "desc" }]
      : [{ priorityScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  try {
    const [reports, total] = await Promise.all([
      prisma.civicReport.findMany({
        where,
        orderBy,
        take: Math.min(options.limit ?? 50, 100),
        select: LIST_SELECT,
      }),
      prisma.civicReport.count({ where }),
    ]);

    return { configured: true, reports, total, error: null };
  } catch (error) {
    console.error("Failed to list reports:", error);
    return {
      configured: true,
      reports: [],
      total: 0,
      error:
        "Could not read reports. Run 'npx prisma migrate dev' if the schema " +
        "has not been applied yet.",
    };
  }
}

/**
 * CivicReport.anonymousId has no foreign key to AnonymousUser — reports can be
 * filed before a session is ever persisted — so reporter handles are resolved
 * in a second pass and simply fall back when there is no matching row.
 */
export async function resolveReporterHandles(
  anonymousIds: Array<string | null>
): Promise<Map<string, string>> {
  const ids = [...new Set(anonymousIds.filter((id): id is string => Boolean(id)))];
  const handles = new Map<string, string>();

  if (ids.length === 0 || !isDatabaseConfigured()) return handles;

  try {
    const users = await prisma.anonymousUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true },
    });

    for (const user of users) handles.set(user.id, user.username);
  } catch (error) {
    console.error("Failed to resolve reporter handles:", error);
  }

  return handles;
}

export interface FeedResult extends ListResult {
  /** anonymousId -> username, for the reporters that could be resolved. */
  handles: Map<string, string>;
}

/** The public feed: reports plus whatever reporter identities are known. */
export async function listFeed(options: ListOptions = {}): Promise<FeedResult> {
  const result = await listReports(options);
  const handles = await resolveReporterHandles(
    result.reports.map((report) => report.anonymousId)
  );

  return { ...result, handles };
}

export interface ReportStats {
  configured: boolean;
  total: number;
  open: number;
  resolved: number;
  routed: number;
  byPriority: Record<PriorityLabel, number>;
}

const EMPTY_PRIORITIES: Record<PriorityLabel, number> = {
  LOW: 0,
  MEDIUM: 0,
  HIGH: 0,
  VERY_HIGH: 0,
};

/** Overview counters. Returns zeroes rather than throwing when the DB is absent. */
export async function getReportStats(): Promise<ReportStats> {
  const empty: ReportStats = {
    configured: false,
    total: 0,
    open: 0,
    resolved: 0,
    routed: 0,
    byPriority: { ...EMPTY_PRIORITIES },
  };

  if (!isDatabaseConfigured()) return empty;

  try {
    const [total, resolved, routed, grouped] = await Promise.all([
      prisma.civicReport.count(),
      prisma.civicReport.count({ where: { status: "RESOLVED" } }),
      prisma.civicReport.count({ where: { routedAt: { not: null } } }),
      prisma.civicReport.groupBy({
        by: ["priorityLabel"],
        _count: { _all: true },
      }),
    ]);

    const byPriority = { ...EMPTY_PRIORITIES };
    for (const row of grouped) {
      if (row.priorityLabel) {
        byPriority[row.priorityLabel] = row._count._all;
      }
    }

    return {
      configured: true,
      total,
      open: total - resolved,
      resolved,
      routed,
      byPriority,
    };
  } catch (error) {
    console.error("Failed to load report stats:", error);
    return { ...empty, configured: true };
  }
}

export async function getReportDetail(id: string) {
  if (!isDatabaseConfigured()) return null;

  try {
    return await prisma.civicReport.findUnique({
      where: { id },
      include: {
        authority: true,
        statusEvents: { orderBy: { createdAt: "asc" } },
        emails: {
          orderBy: { createdAt: "desc" },
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
  } catch (error) {
    console.error("Failed to load report:", error);
    return null;
  }
}

export type ReportDetail = NonNullable<
  Awaited<ReturnType<typeof getReportDetail>>
>;
