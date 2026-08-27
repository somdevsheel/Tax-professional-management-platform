import { Type } from "class-transformer";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { TASK_PRIORITIES } from "@tax-platform/types";

export class CreateTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  portalAccountId?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  // Free-form for now — the recurrence engine itself (Task's Phase-6+ scope) reads and
  // interprets this; validated here only as "is it JSON-shaped", not against a specific rule
  // grammar, since that grammar doesn't exist yet.
  @IsOptional()
  @Type(() => Object)
  recurrenceRule?: Record<string, unknown>;
}
