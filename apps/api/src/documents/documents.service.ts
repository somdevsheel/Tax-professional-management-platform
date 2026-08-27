import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
// Pinned to v16 deliberately — v17+ dropped CommonJS entirely (ESM-only), which this NestJS
// app's CommonJS build can't `require()`. v16's `fromBuffer` is the same magic-byte sniffing
// this needs; only the export name changed in later majors (renamed to `fileTypeFromBuffer`).
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ObjectStorageService } from "../infra/object-storage/object-storage.service";
import { ANTIVIRUS_SCANNER, type AntivirusScanner } from "../infra/antivirus/antivirus-scanner.interface";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { UploadDocumentDto } from "./dto/upload-document.dto";
import type { CreateDocumentCategoryDto } from "./dto/create-document-category.dto";

export interface DocumentListFilters {
  clientId?: string;
  categoryId?: string;
  tag?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — enforced again here, not just at Multer's limits, since that's per-field-name config that's easy to drift from this value.

// Sniffed from magic bytes (docs/security-design.md §9: "not just by extension — magic-byte
// sniffing"), not trusted from the client-supplied Content-Type. Deliberately excludes anything
// executable/scriptable (no .exe, .js, .html, macro-bearing legacy Office formats, etc.).
const ALLOWED_BINARY_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
]);

// file-type sniffs magic bytes and has none to find for genuinely plain-text formats (there is
// no such thing as a "plain text" signature) — these two are allowed through on the
// client-declared Content-Type instead, but only after confirming the bytes actually decode as
// valid, printable-enough UTF-8 text, so a mislabeled binary can't sneak through this path.
const ALLOWED_TEXT_MIME_TYPES = new Set(["text/plain", "text/csv"]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: ObjectStorageService,
    @Inject(ANTIVIRUS_SCANNER) private readonly antivirus: AntivirusScanner,
  ) {}

  async listCategories(organizationId: string) {
    return this.prisma.documentCategory.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { name: "asc" },
    });
  }

  async createCategory(organizationId: string, dto: CreateDocumentCategoryDto) {
    return this.prisma.documentCategory.create({ data: { organizationId, ...dto } });
  }

  async list(organizationId: string, filters: DocumentListFilters) {
    const limit = Math.min(filters.limit ?? 50, 200);

    const where: Prisma.DocumentWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.tag ? { tags: { has: filters.tag } } : {}),
      ...(filters.search ? { fileName: { contains: filters.search, mode: "insensitive" as const } } : {}),
    };

    const cursor = filters.cursor
      ? await this.prisma.document.findFirst({ where: { id: filters.cursor, organizationId }, select: { id: true } })
      : null;

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        include: { client: { select: { id: true, name: true } }, category: true },
      }),
      this.prisma.document.count({ where }),
    ]);

    const hasMore = documents.length > limit;
    const page = hasMore ? documents.slice(0, limit) : documents;
    return { data: page, nextCursor: hasMore ? page[page.length - 1].id : null, hasMore, total };
  }

  async listForClient(organizationId: string, clientId: string) {
    await this.requireClient(organizationId, clientId);
    return this.prisma.document.findMany({
      where: { organizationId, clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { category: true },
    });
  }

  async get(organizationId: string, documentId: string) {
    return this.requireDocument(organizationId, documentId);
  }

  async getDownloadUrl(organizationId: string, documentId: string, actorId: string, meta: RequestMeta) {
    const document = await this.requireDocument(organizationId, documentId);
    const url = await this.storage.getPresignedDownloadUrl(document.storageKey, document.fileName);

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "DOCUMENT_DOWNLOADED",
      resourceType: "document",
      resourceId: documentId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { url };
  }

  async upload(
    organizationId: string,
    clientId: string | null,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    if (clientId) {
      await this.requireClient(organizationId, clientId);
    }
    if (dto.categoryId) {
      const category = await this.prisma.documentCategory.findFirst({
        where: { id: dto.categoryId, OR: [{ organizationId }, { organizationId: null }] },
        select: { id: true },
      });
      if (!category) {
        throw AppError.notFound("DOCUMENT_CATEGORY_NOT_FOUND", "Document category not found");
      }
    }

    if (file.size === 0) {
      throw new AppError("EMPTY_FILE", "Uploaded file is empty");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError("FILE_TOO_LARGE", `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`);
    }

    const mimeType = await this.detectAndValidateMimeType(file);

    const scanResult = await this.antivirus.scan(file.buffer);
    if (!scanResult.clean) {
      await this.audit.log({
        organizationId,
        actorUserId: actorId,
        action: "DOCUMENT_UPLOADED",
        resourceType: "document",
        resourceId: null,
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { fileName: file.originalname, reason: scanResult.reason ?? "failed antivirus scan" },
      });
      throw new AppError("UPLOAD_REJECTED", "This file failed a security scan and was not stored.");
    }

    const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");
    // Random, not derived from the filename — a non-guessable storage key
    // (docs/security-design.md §9) so a leaked/enumerated key alone doesn't reveal anything
    // about what the document is.
    const storageKey = `documents/${organizationId}/${randomUUID()}`;
    await this.storage.upload(storageKey, file.buffer, mimeType);

    const document = await this.prisma.document.create({
      data: {
        organizationId,
        clientId,
        categoryId: dto.categoryId,
        fileName: file.originalname,
        storageKey,
        mimeType,
        sizeBytes: file.size,
        checksumSha256,
        tags: dto.tags ? dto.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        uploadedById: actorId,
        accessLevel: dto.accessLevel,
      } as Prisma.DocumentUncheckedCreateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "DOCUMENT_UPLOADED",
      resourceType: "document",
      resourceId: document.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { fileName: document.fileName, sizeBytes: document.sizeBytes, clientId },
    });

    return document;
  }

  async remove(organizationId: string, documentId: string, actorId: string, meta: RequestMeta) {
    await this.requireDocument(organizationId, documentId);
    await this.prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "DOCUMENT_DELETED",
      resourceType: "document",
      resourceId: documentId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /** Sniffs magic bytes rather than trusting the client-declared Content-Type
   *  (docs/security-design.md §9). Plain-text formats have no magic bytes to sniff, so those
   *  fall back to the declared type plus a printable-UTF-8 sanity check on the actual bytes. */
  private async detectAndValidateMimeType(file: Express.Multer.File): Promise<string> {
    const sniffed = await fileTypeFromBuffer(file.buffer);
    if (sniffed) {
      if (!ALLOWED_BINARY_MIME_TYPES.has(sniffed.mime)) {
        throw new AppError("UNSUPPORTED_FILE_TYPE", `File type "${sniffed.mime}" is not allowed`);
      }
      return sniffed.mime;
    }

    if (ALLOWED_TEXT_MIME_TYPES.has(file.mimetype) && this.looksLikePrintableText(file.buffer)) {
      return file.mimetype;
    }

    throw new AppError(
      "UNSUPPORTED_FILE_TYPE",
      "Could not verify this file's type as one of the allowed formats (PDF, images, Word/Excel/PowerPoint, plain text, CSV)",
    );
  }

  private looksLikePrintableText(buffer: Buffer): boolean {
    if (buffer.length === 0) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    let controlChars = 0;
    for (const byte of sample) {
      // Allow tab/newline/carriage-return; anything else below 0x20 (or the 0x7F DEL byte) is
      // a control character a real text file shouldn't be full of.
      if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) controlChars++;
      if (byte === 0x7f) controlChars++;
    }
    return controlChars / sample.length < 0.01;
  }

  private async requireDocument(organizationId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: { client: { select: { id: true, name: true } }, category: true },
    });
    if (!document) {
      throw AppError.notFound("DOCUMENT_NOT_FOUND", "Document was not found");
    }
    return document;
  }

  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
  }
}
