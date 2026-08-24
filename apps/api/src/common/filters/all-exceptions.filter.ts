import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors/app-error";

/**
 * Central error formatter. Never leaks stack traces or internal detail to the client
 * (docs/api-design.md §10, docs/security-design.md §7). Full detail goes to structured
 * server logs keyed by requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";
    let details: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof AppError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = typeof b.message === "string" ? b.message : exception.message;
        if (Array.isArray(b.message)) {
          code = "VALIDATION_ERROR";
          details = (b.message as string[]).map((m) => ({ field: "unknown", message: m }));
          message = "Validation failed";
        } else {
          code = defaultCodeForStatus(status);
        }
      } else {
        message = exception.message;
        code = defaultCodeForStatus(status);
      }
    } else {
      // Unrecognized error: log full detail server-side only.
      this.logger.error({ requestId, err: exception }, "Unhandled exception");
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ requestId, err: exception }, message);
      message = "An unexpected error occurred";
    }

    response.status(status).json({
      success: false,
      error: { code, message, requestId, ...(details ? { details } : {}) },
    });
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}
