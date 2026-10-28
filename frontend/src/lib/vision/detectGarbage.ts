/**
 * Client for the YOLOv8 detection service.
 *
 * Every call is timeboxed and every failure is reported rather than thrown,
 * because the submission route must still persist the report when the model
 * container is down.
 */

import {
  parsePredictResponse,
  type PredictResponse,
} from "@/lib/types/detection";

export type DetectionOutcome =
  | { ok: true; data: PredictResponse; annotatedImageUrl: string | null }
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

/** Turns the service's relative /static path into something the browser can load. */
function absoluteAnnotatedUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  if (/^https?:\/\//i.test(relative)) return relative;
  return `${baseUrl()}${relative.startsWith("/") ? "" : "/"}${relative}`;
}

export async function detectGarbage(file: File): Promise<DetectionOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const form = new FormData();
    form.append("file", file, file.name || "upload.jpg");

    const response = await fetch(`${baseUrl()}/predict`, {
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

    const data = parsePredictResponse(payload);

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

/** Used by the diagnostics surface to show whether the model is reachable. */
export async function checkVisionHealth(): Promise<{
  reachable: boolean;
  detail: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${baseUrl()}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { reachable: false, detail: `HTTP ${response.status}` };
    }
    const body = await response.json();
    return { reachable: true, detail: JSON.stringify(body) };
  } catch (error) {
    return {
      reachable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
