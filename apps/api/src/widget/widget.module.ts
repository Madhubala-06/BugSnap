import { Module } from "@nestjs/common"
import { WidgetController } from "./widget.controller"
import { ReportsModule } from "../reports/reports.module"

@Module({ imports: [ReportsModule], controllers: [WidgetController] })
export class WidgetModule {}
