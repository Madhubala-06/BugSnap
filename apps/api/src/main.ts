import { NestFactory } from "@nestjs/core"
import { NestExpressApplication } from "@nestjs/platform-express"
import { join } from "path"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })

  // Serve uploaded files statically
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads/",
  })

  const port = process.env.PORT || 3002
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
}

bootstrap()
