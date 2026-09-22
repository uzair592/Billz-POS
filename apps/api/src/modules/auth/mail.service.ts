import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly transporter;
  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get("MAIL_HOST", "127.0.0.1"),
      port: config.get("MAIL_PORT", 1025),
      secure: false,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 8_000,
    });
  }

  sendPasswordReset(email: string, token: string) {
    const url = `${this.config.get("WEB_URL", "http://localhost:3000")}/reset-password?token=${encodeURIComponent(token)}`;
    return this.transporter.sendMail({
      from: this.config.get("MAIL_FROM", "no-reply@cafe-pos.local"),
      to: email,
      subject: "Reset your Cafe POS password",
      text: `Use this one-time link within 30 minutes: ${url}`,
    });
  }
}
