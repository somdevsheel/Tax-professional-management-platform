import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { COMPLIANCE_STATUSES } from "@tax-platform/types";

export class UpdateComplianceItemDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  filingDate?: string;

  @IsOptional()
  @IsIn(COMPLIANCE_STATUSES)
  status?: (typeof COMPLIANCE_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
