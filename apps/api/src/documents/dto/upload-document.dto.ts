import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { DOCUMENT_ACCESS_LEVELS } from "@tax-platform/types";

/** Multipart form fields alongside the uploaded file itself — the file comes through
 *  FileInterceptor, not this DTO. `tags` arrives as one comma-separated string (multipart
 *  form-data has no native array encoding worth fighting for a handful of tags) and is split
 *  in the service. */
export class UploadDocumentDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_ACCESS_LEVELS)
  accessLevel?: (typeof DOCUMENT_ACCESS_LEVELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;
}
