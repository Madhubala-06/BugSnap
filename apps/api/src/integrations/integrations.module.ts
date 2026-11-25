import { Global, Module } from "@nestjs/common"
import { IntegrationsController } from "./integrations.controller"
import { IntegrationsService } from "./integrations.service"
import { CiController } from "../ci/ci.controller"

@Global()
@Module({ controllers: [IntegrationsController, CiController], providers: [IntegrationsService], exports: [IntegrationsService] })
export class IntegrationsModule {}
