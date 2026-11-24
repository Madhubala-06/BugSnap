import { NestFactory } from "@nestjs/core"
import { NestExpressApplication } from "@nestjs/platform-express"
import { join } from "path"
import { AppModule } from "./app.module"

/** Builds the Nest app. Used by main.ts (local server) and api/index.js (Vercel function). */
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    // Webhooks (GitHub, Linear) are verified against the exact bytes they sent.
    rawBody: true,
    logger: process.env.NODE_ENV === "production" ? ["error", "warn"] : undefined,
  })

  // Reports carry up to 1000 log entries, so allow bigger JSON bodies than the 100kb default.
  app.useBodyParser("json", { limit: "4mb" })
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true })

  // FRONTEND_URL may be a comma-separated list. The extension calls the API from
  // its own pages, which Chrome exempts from CORS via host_permissions.
  const origins = (process.env.FRONTEND_URL || "http://localhost:3002,http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
  // The website widget is called from customers' own sites, so /widget allows any
  // origin (the endpoint itself checks the site against the project's addresses).
  app.enableCors((req: { url?: string }, cb: (err: Error | null, options: object) => void) => {
    const widget = (req.url ?? "").startsWith("/widget")
    cb(null, {
      origin: widget ? true : origins,
      credentials: false,
      allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version"],
    })
  })

  // Local file uploads (dev only; production uses Vercel Blob)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" })
  }
  app.getHttpAdapter().getInstance().disable("x-powered-by")
  return app
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: ((req: any, res: any) => void) | null = null

/** Express request handler for serverless platforms. */
export async function getHandler() {
  if (!handler) {
    const app = await createApp()
    await app.init()
    handler = app.getHttpAdapter().getInstance()
  }
  return handler
}
