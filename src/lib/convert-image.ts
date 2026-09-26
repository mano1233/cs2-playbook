"use client";

/**
 * Re-encodes a screenshot in the browser before it is uploaded.
 *
 * CS2 writes PNGs, and a 1920x1080 one is around 3 MB. As WebP the same picture is
 * roughly a tenth of that, which matters twice: the upload is faster on a home
 * connection, and opening a lineup on a phone mid-round stops being a wait.
 *
 * Deliberately client-side. Doing it on the server would mean a native image library in
 * the container for every architecture the cluster runs, to save bytes that were
 * already sent.
 *
 * Just as deliberately, it does **not** downscale by default. These screenshots carry
 * crosshair coordinate markings, and those tick labels are the precise part — the whole
 * reason the shot is useful. Resolution is capped only far above what CS2 produces, so
 * an ordinary 1080p or 1440p shot passes through at full size and only something
 * enormous is reduced.
 */

export interface ConvertResult {
  file: File;
  /** Bytes before and after, so the UI can be honest about what it did. */
  before: number;
  after: number;
  converted: boolean;
}

const MAX_EDGE = 2560;
const QUALITY = 0.86;

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not decode image"));
    };
    img.src = url;
  });
}

async function encode(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Returns a converted file, or the original when conversion would not help — a small
 * file, an already-compressed JPEG, or a browser that cannot encode.
 */
export async function convertScreenshot(file: File): Promise<ConvertResult> {
  const before = file.size;
  const unchanged = { file, before, after: before, converted: false };

  // Nothing to gain on something already small, and re-encoding a JPEG twice only
  // loses detail.
  if (before < 400 * 1024) return unchanged;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return unchanged;
  }

  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  if (!w || !h) return unchanged;

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return unchanged;
  // Matters when a shot does get scaled: the default nearest-ish resample turns the
  // crosshair tick labels into mush.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();

  let blob = await encode(canvas, "image/webp");
  let ext = "webp";
  let type = "image/webp";

  // Some browsers hand back a PNG when asked for an unsupported type, which would be
  // larger than what we started with. JPEG is the universal fallback.
  if (!blob || blob.type !== "image/webp") {
    blob = await encode(canvas, "image/jpeg");
    ext = "jpg";
    type = "image/jpeg";
  }

  if (!blob || blob.size >= before) return unchanged;

  const stem = file.name.replace(/\.[a-z0-9]+$/i, "");
  return {
    // The name is kept because the importer reads the throw name and shot kind out of
    // it. Losing it here would lose the only thing that groups the shots.
    file: new File([blob], `${stem}.${ext}`, { type }),
    before,
    after: blob.size,
    converted: true,
  };
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
