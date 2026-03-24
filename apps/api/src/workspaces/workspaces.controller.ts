import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from "@nestjs/common"
import { WorkspacesService } from "./workspaces.service"

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(@Body() body: { name: string; slug: string }) {
    return this.workspacesService.create(body)
  }

  @Post("with-user")
  createWithUser(
    @Body()
    body: {
      workspaceName: string
      workspaceSlug: string
      userName: string
      userEmail: string
    }
  ) {
    return this.workspacesService.createWithUser(body)
  }

  @Get("slug/:slug")
  findBySlug(@Param("slug") slug: string) {
    return this.workspacesService.findBySlug(slug)
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.workspacesService.findOne(id)
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: { name?: string; slug?: string }
  ) {
    return this.workspacesService.update(id, body)
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.workspacesService.delete(id)
  }
}
