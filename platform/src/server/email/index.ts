import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Machine-readable tag, e.g. "email_verify". Used by tests and logs. */
  tag: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Development/test transport: appends each message as a JSON line to a local file. */
class LogEmailProvider implements EmailProvider {
  constructor(private readonly dir: string) {}
  async send(message: EmailMessage) {
    await mkdir(this.dir, { recursive: true });
    const line = JSON.stringify({ ...message, sentAt: new Date().toISOString() });
    await appendFile(path.join(this.dir, "outbox.jsonl"), line + "\n", "utf8");
  }
}

class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(message: EmailMessage) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: { "X-Ayten-Tag": message.tag },
    });
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    const transport = process.env.EMAIL_TRANSPORT ?? "log";
    if (transport === "smtp") {
      const url = process.env.SMTP_URL;
      if (!url) throw new Error("SMTP_URL is required when EMAIL_TRANSPORT=smtp");
      provider = new SmtpEmailProvider(url, process.env.EMAIL_FROM ?? "no-reply@example.com");
    } else if (transport === "log") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOG_EMAIL !== "1") {
        throw new Error("EMAIL_TRANSPORT=log is not allowed in production");
      }
      provider = new LogEmailProvider(path.resolve(/* turbopackIgnore: true */ process.env.OUTBOX_DIR ?? ".data"));
    } else {
      throw new Error(`Unknown EMAIL_TRANSPORT: ${transport}`);
    }
  }
  return provider;
}

/** Test hook. */
export function setEmailProvider(p: EmailProvider | undefined) {
  provider = p;
}
