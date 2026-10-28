/**
 * Picks which authority a report goes to.
 *
 * Order of resolution:
 *   1. Department, from the dominant waste category — biomedical waste is a
 *      pollution-control matter, not a sanitation one.
 *   2. Jurisdiction, by ward name, then by distance to a ward centroid.
 *   3. Escalation tier, by priority — VERY_HIGH copies the parent office.
 *
 * Falls back upward (ward -> zone -> city) rather than failing, because an
 * unroutable report is worse than an imprecisely routed one.
 */

import type { Authority, Department } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { haversineMeters, isValidCoordinate } from "@/lib/geo/haversine";
import type { PriorityLabel } from "@/lib/priority/computePriority";

export interface RoutingInput {
  latitude?: number | null;
  longitude?: number | null;
  wardName?: string | null;
  city?: string | null;
  dominantCategory?: string | null;
  /** CivicReport.type. Only the garbage track routes by material. */
  reportType?: string;
  priorityLabel: PriorityLabel;
  /** Zone types found nearby, e.g. ["WATER_BODY"]. Influences department. */
  nearbyZoneTypes?: string[];
}

export interface RoutingResult {
  authority: Authority | null;
  ccEmails: string[];
  /** Human-readable explanation, stored and shown in the UI. */
  rationale: string[];
  escalatedTo: Authority | null;
}

const EMPTY: RoutingResult = {
  authority: null,
  ccEmails: [],
  rationale: ["No authority could be resolved — routing table is unavailable."],
  escalatedTo: null,
};

/** Which department owns this kind of waste. */
export function departmentForCategory(
  dominantCategory: string | null | undefined,
  nearbyZoneTypes: string[] = [],
  reportType: string = "GARBAGE"
): Department {
  // Every rule below reasons about waste material or about waste contaminating
  // a water body. None of it applies to a road defect, which would otherwise
  // be sent to the water board for being near a lake.
  if (reportType !== "GARBAGE") return "SANITATION";

  switch (dominantCategory) {
    case "Biomedical/Hazardous":
      return "POLLUTION_CONTROL";
    case "E-waste":
      return "POLLUTION_CONTROL";
    default:
      break;
  }

  // Waste beside a lake is a contamination problem regardless of material.
  if (nearbyZoneTypes.includes("WATER_BODY")) return "WATER";

  if (dominantCategory === "Organic/Food") return "HEALTH";

  return "SANITATION";
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function resolveAuthority(
  input: RoutingInput
): Promise<RoutingResult> {
  if (!isDatabaseConfigured()) return EMPTY;

  try {
    const rationale: string[] = [];

    const department = departmentForCategory(
      input.dominantCategory,
      input.nearbyZoneTypes ?? [],
      input.reportType ?? "GARBAGE"
    );

    const departmentName = department.replace(/_/g, " ").toLowerCase();

    // Material-based routing only makes sense for waste. A road defect has no
    // dominant material, and claiming one in the notice would misdescribe the
    // report to the officer receiving it.
    rationale.push(
      input.reportType && input.reportType !== "GARBAGE"
        ? `Routed to the ward office; CivicBridge has no dedicated roads ` +
            `department configured, so this is handled by the ${departmentName} desk.`
        : `Dominant material "${input.dominantCategory ?? "unclassified"}" routes to ` +
            `the ${departmentName} department.`
    );

    const all = await prisma.authority.findMany({ where: { isActive: true } });
    if (all.length === 0) return EMPTY;

    const wardKey = normalise(input.wardName);
    const hasCoords = isValidCoordinate(input.latitude, input.longitude);

    // --- jurisdiction: ward-level candidates ------------------------------
    const wardCandidates = all.filter((a) => a.escalationTier === 1);

    let ward: Authority | null = null;

    if (wardKey) {
      ward =
        wardCandidates.find((a) => normalise(a.wardName) === wardKey) ??
        wardCandidates.find(
          (a) =>
            normalise(a.wardName).includes(wardKey) ||
            wardKey.includes(normalise(a.wardName))
        ) ??
        null;

      if (ward) {
        rationale.push(`Matched ward "${ward.wardName}" by name.`);
      }
    }

    if (!ward && hasCoords) {
      const withDistance = wardCandidates
        .filter((a) => a.centroidLat !== null && a.centroidLng !== null)
        .map((a) => ({
          authority: a,
          distance: haversineMeters(
            input.latitude as number,
            input.longitude as number,
            a.centroidLat as number,
            a.centroidLng as number
          ),
        }))
        .filter((entry) => entry.distance <= entry.authority.radiusMeters)
        .sort((a, b) => a.distance - b.distance);

      if (withDistance.length > 0) {
        ward = withDistance[0].authority;
        rationale.push(
          `Matched ward "${ward.wardName}" by proximity ` +
            `(${Math.round(withDistance[0].distance)}m from its centroid).`
        );
      }
    }

    // --- department specialist (usually city tier) ------------------------
    const specialist =
      department === "SANITATION"
        ? null
        : all.find((a) => a.department === department) ?? null;

    // --- choose the primary recipient -------------------------------------
    let primary: Authority | null = specialist ?? ward;

    if (specialist && ward) {
      rationale.push(
        `${specialist.name} takes the lead; the ward office is copied for local action.`
      );
    }

    if (!primary) {
      // Nothing matched — escalate to the widest-jurisdiction office we have.
      primary =
        all
          .filter((a) => a.escalationTier === 3)
          .sort((a, b) => b.radiusMeters - a.radiusMeters)[0] ?? all[0];
      rationale.push(
        `No ward matched this location; defaulting to ${primary.name}.`
      );
    }

    // --- escalation by priority -------------------------------------------
    const ccSet = new Set<string>(primary.ccEmails);

    if (specialist && ward) ccSet.add(ward.email);

    let escalatedTo: Authority | null = null;

    if (input.priorityLabel === "VERY_HIGH" && primary.parentAuthorityId) {
      escalatedTo =
        all.find((a) => a.id === primary.parentAuthorityId) ?? null;

      if (escalatedTo) {
        ccSet.add(escalatedTo.email);
        rationale.push(
          `Priority is Very High — ${escalatedTo.name} copied as the escalation tier.`
        );
      }
    }

    ccSet.delete(primary.email);

    return {
      authority: primary,
      ccEmails: [...ccSet],
      rationale,
      escalatedTo,
    };
  } catch (error) {
    console.error("Authority resolution failed:", error);
    return EMPTY;
  }
}
