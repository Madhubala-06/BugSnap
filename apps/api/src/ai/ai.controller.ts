import { Controller, Post, Body } from "@nestjs/common"
import { AIService } from "./ai.service"

@Controller("ai")
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post("analyze")
  async analyzeScreenshots(@Body() body: { screenshots: string[] }) {
    const analysis = await this.aiService.analyzeScreenshots(body.screenshots)
    if (!analysis) {
      return { success: false, error: "Failed to analyze screenshots" }
    }
    return { success: true, analysis }
  }

  @Post("generate-report")
  async generateReport(
    @Body()
    body: {
      screenshots: string[]
      consoleErrors?: string[]
      networkErrors?: string[]
    }
  ) {
    const analysis = await this.aiService.generateBugDescription(
      body.screenshots,
      body.consoleErrors,
      body.networkErrors
    )
    if (!analysis) {
      return { success: false, error: "Failed to generate report" }
    }
    return { success: true, analysis }
  }
}
