import { IsString, MinLength } from "class-validator";

/** Step-up re-authentication: the caller must re-prove their own login password to reveal a
 *  credential's plaintext (docs/security-design.md §6). */
export class RevealCredentialDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
