import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common"
import { UsersService } from "./users.service"

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(
    @Body()
    body: {
      email: string
      name: string
      workspaceId: string
      avatarUrl?: string
    }
  ) {
    return this.usersService.create(body)
  }

  @Get()
  findByWorkspace(@Query("workspaceId") workspaceId: string) {
    return this.usersService.findByWorkspace(workspaceId)
  }

  @Get("email/:email")
  findByEmail(@Param("email") email: string) {
    return this.usersService.findByEmail(email)
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id)
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: { name?: string; avatarUrl?: string }
  ) {
    return this.usersService.update(id, body)
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.usersService.delete(id)
  }
}
