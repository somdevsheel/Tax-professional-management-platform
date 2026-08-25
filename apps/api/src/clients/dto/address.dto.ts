import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Explicit shape instead of an open `@IsObject()` bag — an unvalidated arbitrary object
 * accepted straight into a `Json` column has no size/depth bound, which is an easy way to
 * bloat storage or send deeply nested JSON for no functional reason (docs/security-review.md).
 */
export class AddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
