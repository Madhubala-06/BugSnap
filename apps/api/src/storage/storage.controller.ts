import { Controller, Get, Post, Body, UseInterceptors, UploadedFile, BadRequestException } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { StorageService, type Folder } from "./storage.service"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, type AuthContext } from "../auth/public.decorator"

@Controller("upload")
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService
  ) {}

  /** Ask for a direct-upload token (production) or learn to use local upload (dev). */
  @Post("token")
  token(@Auth() auth: AuthContext, @Body() body: { kind?: string; contentType?: string }) {
    const folder: Folder = body?.kind === "recording" ? "recordings" : "thumbnails"
    return this.storage.createUploadToken(auth.workspaceId, folder, String(body?.contentType ?? ""))
  }

  @Post("image")
  async uploadImage(@Auth() auth: AuthContext, @Body() body: { dataUrl?: string }) {
    return { success: true, ...(await this.storage.saveDataUrl(auth.workspaceId, body?.dataUrl)) }
  }

  @Post("recording")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 200 * 1024 * 1024 } }))
  async uploadRecording(@UploadedFile() file: Express.Multer.File) {
    if (this.storage.blobEnabled) throw new BadRequestException("Use /upload/token for uploads")
    if (!file) throw new BadRequestException("No file uploaded")
    return { success: true, ...(await this.storage.saveLocal(file, "recordings")) }
  }

  @Post("thumbnail")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadThumbnail(@UploadedFile() file: Express.Multer.File) {
    if (this.storage.blobEnabled) throw new BadRequestException("Use /upload/token for uploads")
    if (!file) throw new BadRequestException("No file uploaded")
    return { success: true, ...(await this.storage.saveLocal(file, "thumbnails")) }
  }

  /** Recordings and screenshots for this workspace, taken from its reports. */
  @Get("recordings")
  async recordings(@Auth() auth: AuthContext) {
    return (await this.files(auth.workspaceId)).recordings
  }

  @Get("thumbnails")
  async thumbnails(@Auth() auth: AuthContext) {
    return (await this.files(auth.workspaceId)).screenshots
  }

  private async files(workspaceId: string) {
    const reports = await this.prisma.bugReport.findMany({
      where: { workspaceId },
      select: { id: true, title: true, createdAt: true, browserInfo: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    const recordings: { filename: string; url: string; size: number; createdAt: Date; reportId: string; reportTitle: string }[] = []
    const screenshots: typeof recordings = []
    for (const r of reports) {
      const info = (r.browserInfo ?? {}) as { recordingUrl?: string; screenshotUrls?: string[] }
      const name = (u: string) => u.split("/").pop() || u
      if (info.recordingUrl) recordings.push({ filename: name(info.recordingUrl), url: info.recordingUrl, size: 0, createdAt: r.createdAt, reportId: r.id, reportTitle: r.title })
      for (const u of info.screenshotUrls ?? []) screenshots.push({ filename: name(u), url: u, size: 0, createdAt: r.createdAt, reportId: r.id, reportTitle: r.title })
    }
    return { recordings, screenshots }
  }
}
