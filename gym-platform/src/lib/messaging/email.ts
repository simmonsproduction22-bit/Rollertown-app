import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachments?: { filename: string; content: string /* base64 */ }[];
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id: string; status: "sent" | "failed"; error?: string }>;
}

class ConsoleEmail implements EmailProvider {
  readonly name = "console";
  async send(msg: EmailMessage) {
    log.info("email.stub", { to: msg.to, subject: msg.subject });
    return { id: `stub_${crypto.randomUUID().slice(0, 8)}`, status: "sent" as const };
  }
}

class ResendEmail implements EmailProvider {
  readonly name = "resend";
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, attachments: msg.attachments }),
    });
    const json = (await res.json()) as { id?: string; message?: string };
    return res.ok ? { id: json.id ?? "", status: "sent" as const } : { id: "", status: "failed" as const, error: json.message };
  }
}

export function emailProvider(): EmailProvider {
  return env.emailProvider === "resend" && env.resendKey ? new ResendEmail() : new ConsoleEmail();
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
