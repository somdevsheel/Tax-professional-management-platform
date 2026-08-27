import { IsOptional, IsUUID } from "class-validator";

export class AssignTaskDto {
  // Nullable/omittable to support unassigning — absent or null clears the task's assignee.
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;
}
