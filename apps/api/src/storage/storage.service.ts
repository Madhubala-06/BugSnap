import { BadRequestException, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { put } from "@vercel/blob"

export type Folder = "recordings" | "thumbnails"

export interface UploadedFile {
  filename: string
  url: string
  size: number
  mimeType: string
}

const ALLOWED: Record<Folder, { types: string[]; ext: Record<string, string>; maxBytes: number }> = {
  recordings: { types: ["video/webm", "video/mp4"], ext: { "video/webm": "webm", "video/mp4": "mp4" }, maxBytes: 200 * 1024 * 1024 },
  thumbnails: {
    types: ["image/jpeg", "image/png", "image/webp"],
    ext: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
    maxBytes: 8 * 1024 * 1024,
  },
}

/**
 * Two modes:
 *  - blob: production. The extension uploads straight to Vercel Blob with a
 *    short-lived token that only allows one path inside the user's workspace.
 *  - local: dev. Files go to ./uploads and are served at /uploads.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  readonly uploadDir = path.join(process.cwd(), "uploads")
  private readonly baseUrl: string

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get("BASE_URL") || "http://localhost:3001"
    if (!this.blobEnabled) {
      for (const folder of ["recordings", "thumbnails"]) {
        try {
          fs.mkdirSync(path.join(this.uploadDir, folder), { recursive: true })
        } catch (error) {
          this.logger.warn(`Could not create uploads folder: ${error}`)
        }
      }
    }
  }

  get blobEnabled() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  }

  /** Short-lived token for one direct upload to Vercel Blob. */
  async createUploadToken(workspaceId: string, folder: Folder, contentType: string) {
    const rule = ALLOWED[folder]
    const type = rule.types.includes(contentType) ? contentType : rule.types[0]
    if (!this.blobEnabled) return { mode: "local" as const }
    const pathname = `w/${workspaceId}/${folder}/${crypto.randomUUID()}.${rule.ext[type]}`
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      allowedContentTypes: [type],
      maximumSizeInBytes: rule.maxBytes,
      addRandomSuffix: false,
      validUntil: Date.now() + 10 * 60 * 1000,
    })
    return { mode: "blob" as const, pathname, clientToken, contentType: type }
  }

  async saveLocal(file: Express.Multer.File, folder: Folder): Promise<UploadedFile> {
    const rule = ALLOWED[folder]
    const type = rule.types.includes(file.mimetype) ? file.mimetype : rule.types[0]
    const filename = `${crypto.randomUUID()}.${rule.ext[type]}`
    await fs.promises.writeFile(path.join(this.uploadDir, folder, filename), file.buffer)
    return { filename, url: `${this.baseUrl}/uploads/${folder}/${filename}`, size: file.size, mimeType: type }
  }

  /** Saves an edited screenshot sent from the dashboard as a data URL. */
  async saveDataUrl(workspaceId: string, dataUrl: unknown): Promise<UploadedFile> {
    const match = typeof dataUrl === "string" ? dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/) : null
    if (!match) throw new BadRequestException("Expected a PNG, JPEG or WebP image")
    const type = match[1]
    const buffer = Buffer.from(match[2], "base64")
    if (buffer.length > 4 * 1024 * 1024) throw new BadRequestException("Image is too large (max 4 MB)")
    const ext = ALLOWED.thumbnails.ext[type]
    const filename = `${crypto.randomUUID()}.${ext}`
    if (this.blobEnabled) {
      const blob = await put(`w/${workspaceId}/thumbnails/${filename}`, buffer, {
        access: "public",
        contentType: type,
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      return { filename, url: blob.url, size: buffer.length, mimeType: type }
    }
    await fs.promises.writeFile(path.join(this.uploadDir, "thumbnails", filename), buffer)
    return { filename, url: `${this.baseUrl}/uploads/thumbnails/${filename}`, size: buffer.length, mimeType: type }
  }
}
