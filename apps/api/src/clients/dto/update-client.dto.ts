import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsString, MaxLength, ValidateIf } from "class-validator";
import { ENTITY_TYPES } from "@tax-platform/types";
import { CreateClientDto } from "./create-client.dto";

/**
 * Every field is optional, and the nullable ones accept `null` to clear a value (PartialType's
 * @IsOptional skips validation for null). `name`/`entityType` are the exception: their columns
 * are NOT NULL, so a null must be rejected here as a 400 rather than reaching Prisma as a 500.
 */
export class UpdateClientDto extends PartialType(CreateClientDto) {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(300)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(ENTITY_TYPES)
  entityType?: (typeof ENTITY_TYPES)[number];
}
