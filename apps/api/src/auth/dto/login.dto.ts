import { IsEmail, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  // Bounded even though this is compared, not stored — every login runs Argon2id (default
  // ~64 MiB memory cost) over this value, so an unbounded string is a cheap way to inflate
  // per-request memory/CPU (docs/security-review.md). No legitimate password is near this long.
  @IsString()
  @MaxLength(256)
  password!: string;
}
