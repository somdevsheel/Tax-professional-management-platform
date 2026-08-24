/** Shared API envelope shapes. Source of truth: docs/api-design.md §10. */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { nextCursor?: string | null; hasMore?: boolean };
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface AuthTokens {
  accessToken: string;
  /** Web: not returned in the body (httpOnly cookie). Desktop: returned once, stored in OS secure storage. */
  refreshToken?: string;
  expiresIn: number;
}
