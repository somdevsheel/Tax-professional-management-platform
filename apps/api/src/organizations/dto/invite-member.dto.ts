import { IsEmail, IsUUID } from "class-validator";

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;
}
