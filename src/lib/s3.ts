import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy-init: only created when first used (avoids errors when env vars aren't set)
let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
    }
    _client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
    });
  }
  return _client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required');
  return bucket;
}

/** Resolve the public URL for an S3 object key. */
export function s3PublicUrl(key: string): string {
  const prefix = process.env.S3_PUBLIC_URL_PREFIX;
  if (prefix) return `${prefix.replace(/\/$/, '')}/${key}`;
  return `https://${getBucket()}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

/** Build the S3 key for an original asset. null accountKey = admin-level. */
export function buildS3Key(accountKey: string | null, assetId: string, filename: string): string {
  const prefix = accountKey ?? '_admin';
  return `media/${prefix}/${assetId}/${filename}`;
}

/** Build the S3 key for a thumbnail. null accountKey = admin-level. */
export function buildThumbnailKey(accountKey: string | null, assetId: string): string {
  const prefix = accountKey ?? '_admin';
  return `media/${prefix}/${assetId}/thumb.webp`;
}

/** Upload a buffer to S3. */
export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

/** Delete an object from S3. */
export async function deleteFromS3(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

/** Get a pre-signed URL for private asset access. */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn },
  );
}

/** Download an object from S3 as a Buffer. Used for push-to-ESP. */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  const stream = res.Body;
  if (!stream) throw new Error(`Empty body for S3 key: ${key}`);
  // Convert readable stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
