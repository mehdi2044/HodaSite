import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export interface StorageProvider {
  put(key: string, data: Buffer, mime: string): Promise<string>;
  getSignedUrl(key: string): Promise<string>;
  /** Raw bytes for the /media/* route to stream; null if missing. */
  getBytes(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}
export class LocalStorage implements StorageProvider {
  constructor(private root = process.env.MEDIA_DIR ?? "/data/media") {}
  async put(key: string, data: Buffer) {
    const p = path.join(this.root, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
    return `/media/${key}`;
  }
  async getSignedUrl(key: string) {
    await readFile(path.join(this.root, key));
    return `/media/${key}`;
  }
  async getBytes(key: string) {
    try {
      return await readFile(path.join(this.root, key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await unlink(path.join(this.root, key));
  }
}
export class S3Storage implements StorageProvider {
  private client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });
  private bucket = process.env.S3_BUCKET ?? "media";
  async put(key: string, data: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mime,
      }),
    );
    return `/media/${key}`;
  }
  async getSignedUrl(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 900 },
    );
  }
  async getBytes(key: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
export const storage =
  process.env.STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalStorage();
