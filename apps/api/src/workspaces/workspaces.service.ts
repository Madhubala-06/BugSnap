import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; slug: string }) {
    return this.prisma.workspace.create({
      data,
    })
  }

  async findBySlug(slug: string) {
    return this.prisma.workspace.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { users: true, bugReports: true },
        },
      },
    })
  }

  async findOne(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: {
        users: true,
        _count: {
          select: { bugReports: true },
        },
      },
    })
  }

  async update(id: string, data: { name?: string; slug?: string }) {
    return this.prisma.workspace.update({
      where: { id },
      data,
    })
  }

  async delete(id: string) {
    return this.prisma.workspace.delete({
      where: { id },
    })
  }

  // Create workspace with initial user
  async createWithUser(data: { workspaceName: string; workspaceSlug: string; userName: string; userEmail: string }) {
    return this.prisma.workspace.create({
      data: {
        name: data.workspaceName,
        slug: data.workspaceSlug,
        users: {
          create: {
            name: data.userName,
            email: data.userEmail,
          },
        },
      },
      include: {
        users: true,
      },
    })
  }
}
