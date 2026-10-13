// Content-addressed chunk store on any S3 API. The server never touches file bytes:
// it signs PUT and GET URLs and the agent talks to the store directly.
// Presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
// SDK: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config.js";

export const URL_TTL_SECONDS = 60 * 60;

export type Store = {
  chunkKey(studioId: string, blake3: string): string;
  signPut(key: string, size: number): Promise<string>;
  signGet(key: string): Promise<string>;
  /** Size in bytes when the object exists, null otherwise. */
  head(key: string): Promise<number | null>;
  /** The object's bytes as a stream with its size, or null when it does not exist. */
  get(key: string): Promise<{ body: NodeJS.ReadableStream; size: number } | null>;
  ensureBucket(): Promise<void>;
};

export function createStore(config: Pick<Config, "S3_ENDPOINT" | "S3_REGION" | "S3_BUCKET" | "S3_ACCESS_KEY" | "S3_SECRET_KEY">): Store {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    // RustFS, MinIO, and R2 all serve bucket-in-path URLs.
    forcePathStyle: true,
  });
  const Bucket = config.S3_BUCKET;
  return {
    chunkKey: (studioId, blake3) => `studios/${studioId}/chunks/${blake3}`,
    signPut: (Key, size) => getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentLength: size }), { expiresIn: URL_TTL_SECONDS }),
    signGet: (Key) => getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: URL_TTL_SECONDS }),
    async head(Key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key }));
        return out.ContentLength ?? 0;
      } catch (err) {
        if (err instanceof Error && (err.name === "NotFound" || err.name === "NoSuchKey" || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)) {
          return null;
        }
        throw err;
      }
    },
    async get(Key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key }));
        const body = out.Body as unknown;
        if (!body || typeof (body as { pipe?: unknown }).pipe !== "function") return null;
        return { body: body as NodeJS.ReadableStream, size: out.ContentLength ?? 0 };
      } catch (err) {
        if (err instanceof Error && (err.name === "NotFound" || err.name === "NoSuchKey" || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)) {
          return null;
        }
        throw err;
      }
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404 && !(err instanceof Error && err.name === "NotFound")) throw err;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
  };
}
