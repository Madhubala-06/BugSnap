import { Global, Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ApiKeysController, AuthController } from "./auth.controller"
import { AuthGuard } from "./auth.guard"
import { AuthService } from "./auth.service"
import { Mailer } from "./mailer"

@Global()
@Module({
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, Mailer, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, Mailer],
})
export class AuthModule {}
