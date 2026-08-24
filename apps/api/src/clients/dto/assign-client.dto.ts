import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssignClientDto {
  @IsUUID()
  organizationMemberId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedRole?: string;
}
