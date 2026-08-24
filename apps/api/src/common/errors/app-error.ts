import { HttpStatus } from "@nestjs/common";

/** Domain error with a stable machine-readable code, per docs/api-design.md §10. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(code: string, message: string): AppError {
    return new AppError(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT);
  }

  static unauthorized(code: string, message: string): AppError {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: string, message: string): AppError {
    return new AppError(code, message, HttpStatus.FORBIDDEN);
  }
}
