import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { email: string; name: string; workspaceId: string; avatarUrl?: string }) {
    return this.prisma.user.create({
      data,
      include: { workspace: true },
    })
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { workspace: true },
    })
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { workspace: true },
    })
  }

  async findByWorkspace(workspaceId: string) {
    return this.prisma.user.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    })
  }

  async update(id: string, data: { name?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
    })
  }

  async delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
    })
  }
}
