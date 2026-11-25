import { Module } from "@nestjs/common"
import { McpController } from "./mcp.controller"
import { ReportsModule } from "../reports/reports.module"
import { AiFixModule } from "../ai-fix/ai-fix.module"

@Module({ imports: [ReportsModule, AiFixModule], controllers: [McpController] })
export class McpModule {}
