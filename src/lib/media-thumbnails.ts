import sharp from 'sharp';

const THUMB_MAX = 400;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
]);

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIMES.has(mimeType.toLowerCase());
}

export interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Generate a WebP thumbnail for an image buffer.
 * Returns null for non-images or on failure (graceful degradation).
 */
export async function generateThumbnail(
  input: Buffer,
  mimeType: string,
): Promise<ThumbnailResult | null> {
  if (!isImageMime(mimeType)) return null;

  try {
    const image = sharp(input);
    const metadata = await image.metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    const thumb = await image
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: thumb.data,
      width: thumb.info.width,
      height: thumb.info.height,
      originalWidth,
      originalHeight,
    };
  } catch {
    return null;
  }
}
