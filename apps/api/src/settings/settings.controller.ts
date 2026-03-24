import { Controller, Get, Post, Body } from "@nestjs/common"
import { SettingsService } from "./settings.service"

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("gemini-key")
  getGeminiKey() {
    const maskedKey = this.settingsService.getMaskedGeminiKey()
    return { key: maskedKey }
  }

  @Post("gemini-key")
  setGeminiKey(@Body() body: { key: string }) {
    this.settingsService.setGeminiKey(body.key)
    return { success: true }
  }
}
