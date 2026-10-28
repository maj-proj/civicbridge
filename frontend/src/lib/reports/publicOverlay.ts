import "server-only";

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import {
  isCloudinaryConfigured,
  mirrorImageToCloudinary,
} from "@/lib/storage/uploadImage";

/**
 * A URL is publicly reachable if it is not pointing at the machine that
 * produced it. The detection service writes overlays to its own host, which
 * is fine for the reporter's browser and useless to everyone else.
 */
export function isPubliclyReachable(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return false; // relative: local disk fallback

  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;

    return !(
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local") ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Makes a report's detection overlay reachable from outside this machine,
 * rewriting the stored URL in place. Idempotent and non-fatal: if the mirror
 * fails the report keeps the overlay it had.
 *
 * Returns the URL callers should use now.
 */
export async function ensurePublicOverlay(report: {
  id: string;
  annotatedImageUrl: string | null;
}): Promise<string | null> {
  const current = report.annotatedImageUrl;

  if (!current) return null;
  if (isPubliclyReachable(current)) return current;
  if (!isCloudinaryConfigured() || !isDatabaseConfigured()) return current;

  const mirrored = await mirrorImageToCloudinary(current);
  if (!mirrored) return current;

  try {
    await prisma.civicReport.update({
      where: { id: report.id },
      data: { annotatedImageUrl: mirrored.url },
    });
  } catch (error) {
    console.error("Failed to store mirrored overlay URL:", error);
    return current;
  }

  return mirrored.url;
}
