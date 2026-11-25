import { Global, Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { OpsController } from "./ops.controller"
import { CronController } from "./cron.controller"
import { ErrorsService } from "./errors.service"
import { ErrorsFilter } from "./errors.filter"
import { Mailer } from "../auth/mailer"

@Global()
@Module({
  controllers: [OpsController, CronController],
  providers: [ErrorsService, Mailer, { provide: APP_FILTER, useClass: ErrorsFilter }],
  exports: [ErrorsService],
})
export class OpsModule {}
