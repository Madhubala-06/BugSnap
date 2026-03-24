import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { StorageService } from "./storage.service"

@Controller("upload")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get("recordings")
  async listRecordings() {
    return this.storageService.listFiles("recordings")
  }

  @Get("thumbnails")
  async listThumbnails() {
    return this.storageService.listFiles("thumbnails")
  }

  @Post("recording")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    })
  )
  async uploadRecording(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file uploaded")
    }

    const result = await this.storageService.saveRecording(file)
    return {
      success: true,
      url: result.url,
      filename: result.filename,
      size: result.size,
      mimeType: result.mimeType,
    }
  }

  @Post("thumbnail")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    })
  )
  async uploadThumbnail(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file uploaded")
    }

    const result = await this.storageService.saveThumbnail(file)
    return {
      success: true,
      url: result.url,
      filename: result.filename,
      size: result.size,
      mimeType: result.mimeType,
    }
  }
}
