import { IsIn } from "class-validator";

// Mirrors the desktop automation state machine (docs/browser-automation-design.md §5). The
// backend only records these — it never decides or verifies portal-page state itself.
export const PORTAL_SESSION_EVENT_TYPES = [
  "opened",
  "navigating_to_login",
  "username_filled",
  "password_filled",
  "awaiting_user_challenge",
  "completed",
  "failed",
] as const;

export class ReportEventDto {
  @IsIn(PORTAL_SESSION_EVENT_TYPES)
  type!: (typeof PORTAL_SESSION_EVENT_TYPES)[number];
}
