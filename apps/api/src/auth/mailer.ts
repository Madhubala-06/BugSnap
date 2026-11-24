import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import * as nodemailer from "nodemailer"

@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name)
  private transport: nodemailer.Transporter | null = null

  get configured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
  }

  private getTransport() {
    if (!this.transport) {
      const port = Number(process.env.SMTP_PORT || 587)
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      })
    }
    return this.transport
  }

  /** Returns false when email is not set up (dev); the code is then logged instead. */
  async sendLoginCode(email: string, code: string): Promise<boolean> {
    if (!this.configured) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException("Email sign-in is not set up yet. Please try again later.")
      }
      this.logger.warn(`[dev] Login code for ${email}: ${code}`)
      return false
    }
    const from = process.env.EMAIL_FROM || `BugSnap <${process.env.SMTP_USER}>`
    try {
      await this.send(from, email, code)
    } catch (error) {
      this.logger.error(`Sending login email failed: ${error instanceof Error ? error.message : error}`)
      throw new ServiceUnavailableException("We could not send the email right now. Please try again in a minute.")
    }
    return true
  }

  private async send(from: string, email: string, code: string) {
    await this.getTransport().sendMail({
      from,
      to: email,
      subject: `${code} is your BugSnap code`,
      text: `Your BugSnap sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">Your BugSnap code</h2>
  <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
  <p style="color:#555">It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
</div>`,
    })
  }

  /** Any plain email (invites, notifications). Returns false when email is not set up. */
  async sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`[dev] Email to ${to}: ${subject}\n${text}`)
      return false
    }
    const from = process.env.EMAIL_FROM || `BugSnap <${process.env.SMTP_USER}>`
    try {
      await this.getTransport().sendMail({ from, to, subject, text, html })
      return true
    } catch (error) {
      this.logger.error(`Email to ${to} failed: ${error instanceof Error ? error.message : error}`)
      return false
    }
  }
}
