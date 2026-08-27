import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { COMPLIANCE_STATUSES } from "@tax-platform/types";

export class ListComplianceItemsQuery {
  @IsOptional()
  @IsIn(COMPLIANCE_STATUSES)
  status?: (typeof COMPLIANCE_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  complianceTypeId?: string;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;

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
