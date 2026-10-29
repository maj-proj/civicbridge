/**
 * Evidence image storage.
 *
 * Cloudinary when it is configured, local disk under public/uploads when it
 * is not. The local path exists so the pipeline runs end to end with mock
 * environment values — it is not suitable for deployment, because anything
 * written beside the build is lost on the next one.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredImage {
  url: string;
  provider: "cloudinary" | "local";
  publicId?: string;
}

const PLACEHOLDER_HINTS = ["your_", "placeholder", "changeme"];

function isConfiguredValue(value: string | undefined): value is string {
  if (!value) return false;
  const lowered = value.toLowerCase();
  return !PLACEHOLDER_HINTS.some((hint) => lowered.includes(hint));
}

export function isCloudinaryConfigured(): boolean {
  return (
    isConfiguredValue(process.env.CLOUDINARY_CLOUD_NAME) &&
    isConfiguredValue(process.env.CLOUDINARY_API_KEY) &&
    isConfiguredValue(process.env.CLOUDINARY_API_SECRET)
  );
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * Cloudinary's signature is the SHA-1 of the signed parameters in
 * alphabetical order, concatenated with the API secret.
 */
function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

async function uploadToCloudinary(
  file: File,
  mimeType: string
): Promise<StoredImage> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey = process.env.CLOUDINARY_API_KEY as string;
  const apiSecret = process.env.CLOUDINARY_API_SECRET as string;
  const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "civicbridge/garbage";

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signCloudinaryParams({ folder, timestamp }, apiSecret);

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    secure_url?: string;
    url?: string;
    public_id?: string;
  };

  const url = data.secure_url ?? data.url;
  if (!url) throw new Error("Cloudinary returned no URL");

  void mimeType;

  return { url, provider: "cloudinary", publicId: data.public_id };
}

async function uploadToLocalDisk(
  file: File,
  mimeType: string
): Promise<StoredImage> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${extensionFor(mimeType)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(path.join(dir, filename), buffer);

  return { url: `/uploads/${filename}`, provider: "local" };
}

/**
 * Mirrors an image that already lives somewhere else into Cloudinary.
 *
 * The detection overlay is written to the Python service's own disk and
 * served from its host, so the URL is unreachable to anyone but the machine
 * running it — including the authority receiving the notice. Cloudinary
 * cannot fetch it either (it cannot resolve localhost), so the bytes are
 * pulled here and re-uploaded.
 *
 * Returns null when Cloudinary is unconfigured or anything fails; the caller
 * keeps the original URL rather than losing the image.
 */
export async function mirrorImageToCloudinary(
  sourceUrl: string,
  timeoutMs = 15_000
): Promise<StoredImage | null> {
  if (!isCloudinaryConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(sourceUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`source returned ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type || "image/jpeg";
    const file = new File([blob], `overlay.${extensionFor(mimeType)}`, {
      type: mimeType,
    });

    return await uploadToCloudinary(file, mimeType);
  } catch (error) {
    console.warn(`Could not mirror ${sourceUrl} to Cloudinary:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadEvidenceImage(file: File): Promise<StoredImage> {
  const mimeType = file.type || "image/jpeg";

  if (isCloudinaryConfigured()) {
    try {
      return await uploadToCloudinary(file, mimeType);
    } catch (error) {
      // Storage must not cost us a citizen's report.
      console.warn("Cloudinary upload failed, falling back to disk:", error);
    }
  }

  return uploadToLocalDisk(file, mimeType);
}
