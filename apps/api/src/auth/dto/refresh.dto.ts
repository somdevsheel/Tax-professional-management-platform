import { IsOptional, IsString } from "class-validator";

/**
 * Web sends the refresh token via an httpOnly cookie (not in this body). Desktop has no
 * cookie jar shared with the backend in the same way, so it sends the token it holds in OS
 * secure storage explicitly (docs/security-design.md §2).
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
