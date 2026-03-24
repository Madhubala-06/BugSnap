import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MulterModule } from "@nestjs/platform-express"
import { memoryStorage } from "multer"
import { PrismaModule } from "./prisma/prisma.module"
import { StorageModule } from "./storage/storage.module"
import { SessionsModule } from "./sessions/sessions.module"
import { ReportsModule } from "./reports/reports.module"
import { UsersModule } from "./users/users.module"
import { WorkspacesModule } from "./workspaces/workspaces.module"
import { SettingsModule } from "./settings/settings.module"
import { AIModule } from "./ai/ai.module"
import { HealthController } from "./health.controller"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    PrismaModule,
    SettingsModule,
    AIModule,
    StorageModule,
    SessionsModule,
    ReportsModule,
    UsersModule,
    WorkspacesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
