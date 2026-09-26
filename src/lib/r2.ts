/**
 * R2 access.
 *
 * The bucket is private and stays that way: radar images and lineup screenshots are
 * served through authenticated routes rather than by handing out public object URLs,
 * so access follows the roster rather than whoever has a link.
 *
 * Credentials arrive as AWS_* because that is what the S3 client reads; Terraform mints
 * them from a Cloudflare API token and writes them into the cluster secret.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env";

let client: S3Client | undefined;

function s3() {
  if (!client) {
    const { endpoint, accessKeyId, secretAccessKey } = env.r2();
    client = new S3Client({
      endpoint,
      // R2 has no regions, but the SDK insists on one.
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export interface FetchedObject {
  body: ReadableStream;
  contentType: string;
  contentLength?: number;
  etag?: string;
}

/** Null when the object is absent, so callers can answer 404 rather than 500. */
export async function getObject(key: string): Promise<FetchedObject | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: env.r2().bucket, Key: key }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength,
      etag: res.ETag,
    };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.r2().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Content-addressed by a random id, so the bytes at a key never change.
      CacheControl: "private, max-age=604800, immutable",
    }),
  );
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: env.r2().bucket, Key: key }));
}
