import { Module } from "@nestjs/common"
import { PlansController } from "./plans.controller"
import { Mailer } from "../auth/mailer"

@Module({ controllers: [PlansController], providers: [Mailer] })
export class PlansModule {}
