/**
 * Upload validation for lineup screenshots.
 *
 * Sniffed by magic bytes, not by the declared content type or the filename: both are
 * attacker-controlled, and this service is on the open internet. An HTML file named
 * .png is the case that matters — served back from our own origin it would run as our
 * own page, so the type the bytes actually are is the only one worth trusting.
 *
 * Deliberately no re-encoding step. A CS2 screenshot carries no EXIF worth stripping,
 * and pulling in a native image library would add an arm64 build dependency for the
 * whole cluster's benefit of nothing.
 */
export const MAX_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { ext: string; type: string; match: (b: Uint8Array) => boolean }[] = [
  {
    ext: "png",
    type: "image/png",
    match: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: "jpg",
    type: "image/jpeg",
    match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "webp",
    type: "image/webp",
    match: (b) =>
      b.length > 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export type Sniffed = { ok: true; ext: string; type: string } | { ok: false; error: string };

export function sniffImage(bytes: Uint8Array): Sniffed {
  if (bytes.length === 0) return { ok: false, error: "empty file" };
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: `too large (max ${MAX_BYTES / 1024 / 1024} MB)` };
  }
  const hit = SIGNATURES.find((s) => s.match(bytes));
  if (!hit) return { ok: false, error: "not a PNG, JPEG or WebP" };
  return { ok: true, ext: hit.ext, type: hit.type };
}
