import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateComplianceItemDto {
  @IsUUID()
  complianceTypeId!: string;

  @IsString()
  @MaxLength(10)
  financialYear!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  assessmentYear?: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
