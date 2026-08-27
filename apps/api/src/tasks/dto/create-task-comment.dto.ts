import { IsString, MaxLength } from "class-validator";

export class CreateTaskCommentDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}
