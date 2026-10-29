/**
 * Client for the pothole half of the detection service.
 *
 * Same discipline as detectGarbage: timeboxed, and every failure is returned
 * rather than thrown, so a dead model container still lets the report be
 * saved.
 */

import {
  parsePotholeResponse,
  type PotholePredictResponse,
} from "@/lib/types/potholeDetection";

export type PotholeDetectionOutcome =
  | { ok: true; data: PotholePredictResponse; annotatedImageUrl: string | null }
  | { ok: false; error: string };

function baseUrl(): string {
  return (process.env.GARBAGE_API_URL || "http://localhost:8000").replace(
    /\/+$/,
    ""
  );
}

function timeoutMs(): number {
  const parsed = Number(process.env.GARBAGE_API_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function absoluteAnnotatedUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  if (/^https?:\/\//i.test(relative)) return relative;
  return `${baseUrl()}${relative.startsWith("/") ? "" : "/"}${relative}`;
}

export async function detectPothole(
  file: File
): Promise<PotholeDetectionOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const form = new FormData();
    form.append("file", file, file.name || "upload.jpg");

    const response = await fetch(`${baseUrl()}/predict/pothole`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `HTTP ${response.status}`;
      return { ok: false, error: detail };
    }

    const data = parsePotholeResponse(payload);

    return {
      ok: true,
      data,
      annotatedImageUrl: absoluteAnnotatedUrl(data.annotated_image_url),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Detection service timed out after ${timeoutMs()}ms`
          : error.message
        : String(error);

    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
