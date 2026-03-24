import { Injectable } from "@nestjs/common"
import { SettingsService } from "../settings/settings.service"

export interface BugAnalysis {
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  steps: string[]
  suggestions: string[]
  rootCause?: string
  affectedArea?: string
}

const SYSTEM_PROMPT = `You are an expert QA Engineer and Bug Analyst with 10+ years of experience in software testing and debugging. Your task is to analyze screenshots from a bug recording session and create a comprehensive, actionable bug report.

## Your Analysis Process:

1. **Visual Inspection**: Carefully examine each screenshot in sequence to understand:
   - What application/website is being used
   - What actions the user is performing
   - What visual anomalies, errors, or unexpected behaviors are present
   - Any error messages, broken UI elements, or incorrect data displayed

2. **Bug Identification**: Look for:
   - UI/UX issues (broken layouts, overlapping elements, incorrect styling)
   - Functional bugs (buttons not working, forms not submitting, incorrect navigation)
   - Data issues (wrong data displayed, missing content, incorrect calculations)
   - Error states (error messages, 404 pages, loading failures, console errors visible)
   - Performance issues (if indicated by loading states or timeouts)
   - Accessibility issues (contrast problems, missing labels)

3. **Severity Classification**:
   - **critical**: App crashes, data loss, security vulnerabilities, complete feature failure, blocks user workflow entirely
   - **high**: Major feature broken, significant user impact, workaround difficult or impossible
   - **medium**: Feature partially broken, user can work around it, moderate impact on experience
   - **low**: Minor visual issues, cosmetic problems, minimal user impact, nice-to-fix

## Response Format:

Respond ONLY with a valid JSON object (no markdown, no code blocks, no explanation):

{
  "title": "Clear, specific bug title under 100 characters that describes the issue",
  "description": "Detailed description of the bug including: what is happening, where it occurs, and the impact on users. Be specific about what you observe in the screenshots.",
  "severity": "critical|high|medium|low",
  "steps": [
    "Step 1: Specific action observed",
    "Step 2: Next action in sequence",
    "Step 3: Where the bug manifests"
  ],
  "suggestions": [
    "Specific technical suggestion for fixing",
    "Area of code/component to investigate"
  ],
  "rootCause": "Your best assessment of what might be causing this issue based on the visual evidence",
  "affectedArea": "The component, page, or feature affected (e.g., 'Login Form', 'Dashboard Charts', 'Navigation Menu')"
}

## Important Guidelines:

- Be SPECIFIC - reference exact UI elements, buttons, text you see
- Infer the user journey from the screenshot sequence
- If screenshots show a normal flow with no visible bug, still describe what you see and mark severity as "low" with title "No obvious bug detected - review recording"
- Focus on what IS wrong, not what might theoretically go wrong
- Your steps should be reproducible by another tester
- Suggestions should be actionable for developers`

const USER_PROMPT = `Analyze these screenshots from a bug recording session. The screenshots are in chronological order, showing the user's actions leading up to and including the bug.

Examine each image carefully and identify:
1. What the user was trying to do
2. What went wrong (the bug)
3. The severity and impact
4. How to reproduce it
5. Potential causes and fixes

Generate a detailed bug report in JSON format:`

@Injectable()
export class AIService {
  constructor(private readonly settingsService: SettingsService) {}

  async analyzeScreenshots(screenshotUrls: string[]): Promise<BugAnalysis | null> {
    const apiKey = this.settingsService.getGeminiKey()
    if (!apiKey) {
      console.log("No Gemini API key configured")
      return null
    }

    try {
      // Build image content for Gemini Vision (limit to 10 screenshots)
      const limitedUrls = screenshotUrls.slice(0, 10)

      // Fetch images and convert to base64 for Gemini
      const imageParts = await Promise.all(
        limitedUrls.map(async (url) => {
          const imageResponse = await fetch(url)
          const arrayBuffer = await imageResponse.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString("base64")
          const mimeType = imageResponse.headers.get("content-type") || "image/png"
          return {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          }
        })
      )

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${SYSTEM_PROMPT}\n\n${USER_PROMPT}\n\n(${limitedUrls.length} screenshots provided in sequence)` },
                  ...imageParts,
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1500,
            },
          }),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        console.error("Gemini API error:", error)
        return null
      }

      const data = await response.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!content) {
        return null
      }

      // Clean and parse the JSON response
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim()

      const analysis = JSON.parse(cleanedContent) as BugAnalysis
      return analysis
    } catch (error) {
      console.error("Failed to analyze screenshots:", error)
      return null
    }
  }

  async generateBugDescription(
    screenshots: string[],
    consoleErrors?: string[],
    networkErrors?: string[]
  ): Promise<BugAnalysis | null> {
    const apiKey = this.settingsService.getGeminiKey()
    if (!apiKey) {
      return null
    }

    try {
      const limitedScreenshots = screenshots.slice(0, 8)

      // Fetch images and convert to base64 for Gemini
      const imageParts = await Promise.all(
        limitedScreenshots.map(async (url) => {
          const imageResponse = await fetch(url)
          const arrayBuffer = await imageResponse.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString("base64")
          const mimeType = imageResponse.headers.get("content-type") || "image/png"
          return {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          }
        })
      )

      let additionalContext = ""

      if (consoleErrors && consoleErrors.length > 0) {
        additionalContext += `\n\n## Console Errors Captured:\n${consoleErrors.slice(0, 10).map((e, i) => `${i + 1}. ${e}`).join("\n")}`
      }

      if (networkErrors && networkErrors.length > 0) {
        additionalContext += `\n\n## Network Errors Captured:\n${networkErrors.slice(0, 10).map((e, i) => `${i + 1}. ${e}`).join("\n")}`
      }

      const enhancedUserPrompt = `${USER_PROMPT}${additionalContext}\n\n(${limitedScreenshots.length} screenshots provided)`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${SYSTEM_PROMPT}\n\n${enhancedUserPrompt}` },
                  ...imageParts,
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1500,
            },
          }),
        }
      )

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!content) {
        return null
      }

      // Clean and parse the JSON response
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim()

      return JSON.parse(cleanedContent) as BugAnalysis
    } catch (error) {
      console.error("AI analysis failed:", error)
      return null
    }
  }
}
