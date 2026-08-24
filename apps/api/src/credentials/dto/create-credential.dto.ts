import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateCredentialDto {
  @IsString()
  @MaxLength(300)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password!: string;
}
