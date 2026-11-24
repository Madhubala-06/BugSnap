import { Module } from "@nestjs/common"
import { McpController } from "./mcp.controller"
import { ReportsModule } from "../reports/reports.module"

@Module({ imports: [ReportsModule], controllers: [McpController] })
export class McpModule {}
