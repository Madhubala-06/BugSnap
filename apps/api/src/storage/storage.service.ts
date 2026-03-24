import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

export interface UploadedFile {
  filename: string
  originalName: string
  path: string
  url: string
  size: number
  mimeType: string
}

export interface FileInfo {
  filename: string
  url: string
  size: number
  createdAt: Date
}

@Injectable()
export class StorageService {
  private readonly uploadDir: string
  private readonly baseUrl: string

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = path.join(process.cwd(), "uploads")
    this.baseUrl = this.configService.get("BASE_URL") || "http://localhost:3001"

    // Ensure directories exist
    this.ensureDir(path.join(this.uploadDir, "recordings"))
    this.ensureDir(path.join(this.uploadDir, "thumbnails"))
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private generateId(): string {
    return crypto.randomUUID()
  }

  async listFiles(folder: "recordings" | "thumbnails"): Promise<FileInfo[]> {
    const folderPath = path.join(this.uploadDir, folder)

    try {
      const files = await fs.promises.readdir(folderPath)
      const fileInfos: FileInfo[] = []

      for (const filename of files) {
        if (filename === ".gitkeep") continue

        const filePath = path.join(folderPath, filename)
        const stats = await fs.promises.stat(filePath)

        if (stats.isFile()) {
          fileInfos.push({
            filename,
            url: `${this.baseUrl}/uploads/${folder}/${filename}`,
            size: stats.size,
            createdAt: stats.birthtime,
          })
        }
      }

      // Sort by newest first
      return fileInfos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch {
      return []
    }
  }

  async saveRecording(
    file: Express.Multer.File
  ): Promise<UploadedFile> {
    const ext = path.extname(file.originalname) || ".webm"
    const filename = `${this.generateId()}${ext}`
    const filePath = path.join(this.uploadDir, "recordings", filename)

    await fs.promises.writeFile(filePath, file.buffer)

    return {
      filename,
      originalName: file.originalname,
      path: filePath,
      url: `${this.baseUrl}/uploads/recordings/${filename}`,
      size: file.size,
      mimeType: file.mimetype,
    }
  }

  async saveThumbnail(
    file: Express.Multer.File
  ): Promise<UploadedFile> {
    const ext = path.extname(file.originalname) || ".png"
    const filename = `${this.generateId()}${ext}`
    const filePath = path.join(this.uploadDir, "thumbnails", filename)

    await fs.promises.writeFile(filePath, file.buffer)

    return {
      filename,
      originalName: file.originalname,
      path: filePath,
      url: `${this.baseUrl}/uploads/thumbnails/${filename}`,
      size: file.size,
      mimeType: file.mimetype,
    }
  }

  async saveFromBuffer(
    buffer: Buffer,
    folder: "recordings" | "thumbnails",
    originalName: string,
    mimeType: string
  ): Promise<UploadedFile> {
    const ext = path.extname(originalName) || (folder === "recordings" ? ".webm" : ".png")
    const filename = `${this.generateId()}${ext}`
    const filePath = path.join(this.uploadDir, folder, filename)

    await fs.promises.writeFile(filePath, buffer)

    return {
      filename,
      originalName,
      path: filePath,
      url: `${this.baseUrl}/uploads/${folder}/${filename}`,
      size: buffer.length,
      mimeType,
    }
  }

  async delete(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
  }

  async deleteByUrl(url: string): Promise<void> {
    // Extract path from URL
    const urlPath = url.replace(this.baseUrl, "")
    const filePath = path.join(process.cwd(), urlPath)
    await this.delete(filePath)
  }

  getFilePath(folder: "recordings" | "thumbnails", filename: string): string {
    return path.join(this.uploadDir, folder, filename)
  }
}
