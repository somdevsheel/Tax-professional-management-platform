import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  // Minimum length only — Argon2id (not a reversible scheme) makes complexity rules less
  // load-bearing than length; see docs/security-design.md §2.
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  organizationName!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must be lowercase alphanumeric with hyphens only" })
  @MaxLength(60)
  organizationSlug!: string;
}
