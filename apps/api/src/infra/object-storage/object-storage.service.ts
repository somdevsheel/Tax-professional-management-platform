import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * S3-compatible object storage (MinIO locally, any real S3-compatible provider in production —
 * docs/security-design.md §9). Not behind a pluggable-provider interface the way KMS/antivirus
 * are: the S3 API itself is already the abstraction (MinIO and every production-grade object
 * store this product would plausibly target all speak it), so there's no meaningful "swap the
 * whole implementation" seam needed the way there is for a KMS backend.
 *
 * Bytes are never proxied through this service back to a client for download — only short-lived
 * presigned URLs are issued, so the API process's own bandwidth/memory is never on the hook for
 * a large file transfer and a leaked URL self-expires.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const endpoint = this.require("OBJECT_STORAGE_ENDPOINT");
    this.bucket = this.require("OBJECT_STORAGE_BUCKET");
    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>("OBJECT_STORAGE_REGION") ?? "us-east-1",
      credentials: {
        accessKeyId: this.require("OBJECT_STORAGE_ACCESS_KEY"),
        secretAccessKey: this.require("OBJECT_STORAGE_SECRET_KEY"),
      },
      // MinIO (and most self-hosted S3-compatible stores) need path-style addressing —
      // virtual-hosted-style (bucket.endpoint) only resolves for real DNS-backed S3.
      forcePathStyle: true,
    });

    await this.ensureBucketExists();
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getPresignedDownloadUrl(key: string, fileName: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Object storage bucket "${this.bucket}" not found — creating it.`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`${key} must be set for object storage (docs/security-design.md §9).`);
    }
    return value;
  }
}
