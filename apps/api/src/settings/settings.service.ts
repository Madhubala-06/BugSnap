import { Injectable } from "@nestjs/common"
import * as fs from "fs"
import * as path from "path"

interface Settings {
  geminiKey?: string
}

@Injectable()
export class SettingsService {
  private readonly settingsPath: string
  private settings: Settings = {}

  constructor() {
    this.settingsPath = path.join(process.cwd(), "settings.json")
    this.loadSettings()
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, "utf-8")
        this.settings = JSON.parse(data)
      }
    } catch (error) {
      console.error("Failed to load settings:", error)
      this.settings = {}
    }
  }

  private saveSettings() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2))
    } catch (error) {
      console.error("Failed to save settings:", error)
    }
  }

  getGeminiKey(): string | undefined {
    // First check env variable, then fall back to settings.json
    return process.env.GEMINI_API_KEY || this.settings.geminiKey
  }

  getMaskedGeminiKey(): string | undefined {
    const key = this.getGeminiKey()
    if (!key) return undefined
    // Show first 6 chars and last 4 chars
    if (key.length > 14) {
      return key.slice(0, 6) + "..." + key.slice(-4)
    }
    return "***"
  }

  setGeminiKey(key: string) {
    this.settings.geminiKey = key
    this.saveSettings()
  }
}
