import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common"

export const IS_PUBLIC = "isPublic"
/** Route works without signing in. */
export const Public = () => SetMetadata(IS_PUBLIC, true)

export type Role = "owner" | "admin" | "member" | "guest"
export const ROLE_RANK: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 }
export const ROLES: Role[] = ["owner", "admin", "member", "guest"]

export interface AuthContext {
  userId: string
  workspaceId: string
  email: string
  tokenId: string
  role: Role
}

export const MIN_ROLE = "minRole"
/**
 * Lowest role allowed. guest: view, record, comment. member: triage and edit.
 * admin: people and settings. owner: everything.
 */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role)

/** The signed-in user (set by AuthGuard). */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest().auth
})
