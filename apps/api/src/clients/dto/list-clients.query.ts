import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { CLIENT_STATUSES, ENTITY_TYPES } from "@tax-platform/types";

/**
 * Validated query params instead of loose `@Query("x") x?: string` — those reached Prisma
 * untyped (`as never`) and an unvalidated `limit` produced `Number("abc") === NaN`, which
 * Prisma turns into an unhandled 500 rather than a clean 400 (docs/security-review.md).
 */
export class ListClientsQuery {
  @IsOptional()
  @IsIn(CLIENT_STATUSES)
  status?: (typeof CLIENT_STATUSES)[number];

  @IsOptional()
  @IsIn(ENTITY_TYPES)
  entityType?: (typeof ENTITY_TYPES)[number];

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
