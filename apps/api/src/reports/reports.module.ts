import { Module } from "@nestjs/common"
import { PublicReportsController, ReportsController } from "./reports.controller"
import { ReportsService } from "./reports.service"
import { AIModule } from "../ai/ai.module"

@Module({
  imports: [AIModule],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
