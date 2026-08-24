import { IsUUID } from "class-validator";

export class ChangeRoleDto {
  @IsUUID()
  roleId!: string;
}
