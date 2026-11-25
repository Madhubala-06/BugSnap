import { Module } from "@nestjs/common"
import { AiFixController } from "./ai-fix.controller"
import { AiFixService } from "./ai-fix.service"
import { AIModule } from "../ai/ai.module"

@Module({ imports: [AIModule], controllers: [AiFixController], providers: [AiFixService], exports: [AiFixService] })
export class AiFixModule {}
