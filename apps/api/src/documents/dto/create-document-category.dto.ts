import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateDocumentCategoryDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
