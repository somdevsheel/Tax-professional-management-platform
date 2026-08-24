import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreatePortalAccountDto {
  @IsUUID()
  portalId!: string;

  @IsString()
  @MaxLength(50)
  identifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  displayUsername?: string;
}
