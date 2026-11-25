import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { AuthService } from "./auth.service"
import { IS_PUBLIC, MIN_ROLE, ROLE_RANK, type Role } from "./public.decorator"

/** Every route needs a sign-in token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])
    if (isPublic) return true
    const request = context.switchToHttp().getRequest()
    const header: string = request.headers?.authorization ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
    const auth = await this.auth.validate(token)
    if (!auth) throw new UnauthorizedException("Please sign in")
    request.auth = auth
    const min = this.reflector.getAllAndOverride<Role>(MIN_ROLE, [context.getHandler(), context.getClass()]) ?? "guest"
    if (ROLE_RANK[auth.role] < ROLE_RANK[min]) {
      throw new ForbiddenException(
        min === "admin" || min === "owner" ? "Only workspace admins can do this" : "Guests can view and comment, but not change this",
      )
    }
    return true
  }
}
