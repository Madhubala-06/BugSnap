import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common"
import { RateLimit } from "../ops/rate-limit"
import { AuthService } from "./auth.service"
import { Auth, MinRole, Public, type AuthContext } from "./public.decorator"

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({ name: "login-code", by: "ip", limit: 20, windowSec: 3600 })
  @Post("request-code")
  @HttpCode(200)
  requestCode(@Body() body: { email?: string }) {
    return this.auth.requestCode(body?.email)
  }

  @Public()
  @RateLimit({ name: "login-verify", by: "ip", limit: 40, windowSec: 900 })
  @Post("verify")
  @HttpCode(200)
  verify(@Body() body: { email?: string; code?: string; client?: string }) {
    return this.auth.verify(body?.email, body?.code, body?.client)
  }

  @Get("me")
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth)
  }

  @Post("profile")
  @HttpCode(200)
  profile(@Auth() auth: AuthContext, @Body() body: { name?: string; notifyEmail?: boolean }) {
    return this.auth.updateProfile(auth, body ?? {})
  }

  @RateLimit({ name: "ext-token", by: "user", limit: 20, windowSec: 3600 })
  @Post("extension-token")
  @HttpCode(200)
  extensionToken(@Auth() auth: AuthContext) {
    return this.auth.issueExtensionToken(auth)
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Auth() auth: AuthContext) {
    return this.auth.logout(auth)
  }
}

@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@Auth() auth: AuthContext) {
    return this.auth.listApiKeys(auth)
  }

  @RateLimit({ name: "api-key", by: "user", limit: 20, windowSec: 86400 })
  @Post()
  @MinRole("member")
  create(@Auth() auth: AuthContext, @Body() body: { name?: string }) {
    return this.auth.createApiKey(auth, body?.name)
  }

  @Delete(":id")
  revoke(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.auth.revokeApiKey(auth, id)
  }
}
