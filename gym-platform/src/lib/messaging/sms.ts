import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export interface SmsResult {
  readonly providerId: string;
  readonly status: "sent" | "queued" | "failed";
  readonly error?: string;
}

/** Twilio-style SMS abstraction. Swap providers without touching callers. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SmsResult>;
}

const E164 = /^\+[1-9]\d{7,14}$/;

class ConsoleSms implements SmsProvider {
  readonly name = "console";
  async send(to: string, body: string): Promise<SmsResult> {
    log.info("sms.stub", { to, body });
    return { providerId: `stub_${crypto.randomUUID().slice(0, 8)}`, status: "sent" };
  }
}

class TwilioSms implements SmsProvider {
  readonly name = "twilio";
  async send(to: string, body: string): Promise<SmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: env.twilioFrom, Body: body }),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      log.warn("sms.twilio_failed", { status: res.status });
      return { providerId: "", status: "failed", error: json.message ?? "SMS failed" };
    }
    return { providerId: json.sid ?? "", status: "queued" };
  }
}

export function smsProvider(): SmsProvider {
  return env.smsProvider === "twilio" && env.twilioSid && env.twilioToken ? new TwilioSms() : new ConsoleSms();
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!E164.test(to)) return { providerId: "", status: "failed", error: "Invalid phone number" };
  if (body.length === 0 || body.length > 1600) return { providerId: "", status: "failed", error: "Message must be 1–1600 characters" };
  return smsProvider().send(to, body);
}
