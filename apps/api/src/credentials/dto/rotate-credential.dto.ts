import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RotateCredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password?: string;
}
