import { ArgumentsHost, Catch, HttpException } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import type { Request } from "express"
import { ErrorsService } from "./errors.service"
import type { AuthContext } from "../auth/public.decorator"

/** Records unexpected errors (5xx), then answers exactly as Nest normally would. */
@Catch()
export class ErrorsFilter extends BaseExceptionFilter {
  constructor(private readonly errors: ErrorsService) {
    super()
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500 && host.getType() === "http") {
      const req = host.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
      const err = exception instanceof Error ? exception : new Error(String(exception))
      await this.errors.record({
        source: "api",
        message: `${err.name}: ${err.message}`,
        stack: err.stack,
        path: req.originalUrl ?? req.url,
        method: req.method,
        status,
        userId: req.auth?.userId,
        workspaceId: req.auth?.workspaceId,
        userAgent: String(req.headers["user-agent"] ?? ""),
      })
    }
    super.catch(exception, host)
  }
}
