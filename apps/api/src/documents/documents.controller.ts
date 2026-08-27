import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { CreateDocumentCategoryDto } from "./dto/create-document-category.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { ListDocumentsQuery } from "./dto/list-documents.query";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("document-categories")
  @RequirePermission("documents.view")
  async listCategories(@CurrentUser() auth: AuthContext) {
    return { success: true, data: await this.documents.listCategories(auth.organizationId!) };
  }

  @Post("document-categories")
  @RequirePermission("documents.upload")
  async createCategory(@CurrentUser() auth: AuthContext, @Body() dto: CreateDocumentCategoryDto) {
    return { success: true, data: await this.documents.createCategory(auth.organizationId!, dto) };
  }

  @Get("documents")
  @RequirePermission("documents.view")
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListDocumentsQuery) {
    const result = await this.documents.list(auth.organizationId!, query);
    return {
      success: true,
      data: result.data,
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total },
    };
  }

  @Get("documents/:id")
  @RequirePermission("documents.view")
  async get(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.documents.get(auth.organizationId!, id) };
  }

  @Get("documents/:id/download")
  @RequirePermission("documents.view")
  async download(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    return {
      success: true,
      data: await this.documents.getDownloadUrl(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null }),
    };
  }

  @Delete("documents/:id")
  @RequirePermission("documents.delete")
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.documents.remove(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  @Post("documents")
  @RequirePermission("documents.upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async upload(
    @CurrentUser() auth: AuthContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file was uploaded (expected multipart field \"file\")");
    }
    const document = await this.documents.upload(auth.organizationId!, null, file, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: document };
  }

  @Post("clients/:id/documents")
  @RequirePermission("documents.upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async uploadForClient(
    @CurrentUser() auth: AuthContext,
    @Param("id") clientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file was uploaded (expected multipart field \"file\")");
    }
    const document = await this.documents.upload(auth.organizationId!, clientId, file, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: document };
  }

  @Get("clients/:id/documents")
  @RequirePermission("documents.view")
  async listForClient(@CurrentUser() auth: AuthContext, @Param("id") clientId: string) {
    return { success: true, data: await this.documents.listForClient(auth.organizationId!, clientId) };
  }
}
