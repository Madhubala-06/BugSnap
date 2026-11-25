import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common"
import { Auth, MinRole, type AuthContext } from "../auth/public.decorator"
import { RateLimit } from "../ops/rate-limit"
import { AiFixService } from "./ai-fix.service"

@Controller("reports")
export class AiFixController {
  constructor(private readonly fixes: AiFixService) {}

  /** AI writes a small fix and opens a draft pull request that says "Fixes BUG-n". */
  @Post(":id/ai-fix")
  @HttpCode(200)
  @MinRole("member")
  @RateLimit({ name: "ai-fix", by: "user", limit: 10, windowSec: 3600 }, { name: "ai-fix", by: "workspace", limit: 30, windowSec: 86400 })
  open(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { repo?: string }) {
    return this.fixes.openFixPr(auth.workspaceId, auth.userId, id, typeof body?.repo === "string" ? body.repo : undefined)
  }
}
