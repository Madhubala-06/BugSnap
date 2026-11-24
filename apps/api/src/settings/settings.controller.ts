import { Controller, Get, Post, Body, Delete } from "@nestjs/common"
import { SettingsService } from "./settings.service"
import { Auth, MinRole, type AuthContext } from "../auth/public.decorator"

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("gemini-key")
  getGeminiKey(@Auth() auth: AuthContext) {
    return this.settingsService.getKeyStatus(auth.workspaceId)
  }

  @MinRole("admin")
  @Post("gemini-key")
  async setGeminiKey(@Auth() auth: AuthContext, @Body() body: { key: string }) {
    await this.settingsService.setGeminiKey(auth.workspaceId, body?.key)
    return { success: true }
  }

  /** Progress for the dashboard's getting-started checklist. */
  @Get("onboarding")
  onboarding(@Auth() auth: AuthContext) {
    return this.settingsService.onboarding(auth.workspaceId)
  }

  @MinRole("admin")
  @Post("github")
  setGithub(@Auth() auth: AuthContext, @Body() body: { repo?: string }) {
    return this.settingsService.setGithubRepo(auth.workspaceId, body?.repo)
  }

  @MinRole("admin")
  @Delete("gemini-key")
  async removeGeminiKey(@Auth() auth: AuthContext) {
    await this.settingsService.setGeminiKey(auth.workspaceId, null)
    return { success: true }
  }
}
