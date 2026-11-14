// Shrinks a menu photo in the browser before upload, so a 6 MB phone photo
// becomes a small web image. This is a convenience, not a security control:
// Storage still enforces the size and file-type limits.

export const PHOTO_MAX_SIDE = 1200;
export const PHOTO_QUALITY = 0.82;
/** Largest original photo accepted for resizing (phone photos are often 5 to 12 MB). */
export const PHOTO_MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';
  /** True when the photo was re-encoded; false when the original is uploaded as it is. */
  resized: boolean;
}

/** Scales a size down to fit within `maxSide`, keeping its shape. Never scales up. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns the image to upload. JPG, PNG and WebP are scaled to at most 1200px on
 * the longest side and saved as WebP (JPEG where the browser cannot write WebP).
 * GIFs are returned untouched: resizing one in the browser would drop the animation.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const original = file.type as PreparedImage['contentType'];
  if (file.type === 'image/gif') return { blob: file, contentType: 'image/gif', resized: false };

  // Applies the photo's rotation data, so phone photos are not sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const size = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return { blob: file, contentType: original, resized: false };
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    let blob = await encode(canvas, 'image/webp', PHOTO_QUALITY);
    let contentType: PreparedImage['contentType'] = 'image/webp';
    // Browsers that cannot write WebP silently hand back a PNG instead.
    if (!blob || blob.type !== 'image/webp') {
      // JPEG has no transparency: put the brand cream behind see-through areas.
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#FBEFD5';
      context.fillRect(0, 0, size.width, size.height);
      blob = await encode(canvas, 'image/jpeg', PHOTO_QUALITY);
      contentType = 'image/jpeg';
    }
    if (!blob) return { blob: file, contentType: original, resized: false };

    // Already small and no smaller after re-encoding: keep the original.
    const unchangedSize = size.width === bitmap.width && size.height === bitmap.height;
    if (unchangedSize && blob.size >= file.size) {
      return { blob: file, contentType: original, resized: false };
    }
    return { blob, contentType, resized: true };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
