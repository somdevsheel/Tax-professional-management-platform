import { IsUUID } from "class-validator";

export class CreatePortalSessionDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  portalAccountId!: string;
}
