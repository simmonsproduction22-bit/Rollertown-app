import "server-only";

/** Centralized, validated env access. Secrets are read server-side only. */
export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  platformFeeBps: Number.parseInt(process.env.PLATFORM_FEE_BPS ?? "300", 10),
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  twilioSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFrom: process.env.TWILIO_FROM_NUMBER ?? "",
  emailProvider: process.env.EMAIL_PROVIDER ?? "console",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "no-reply@example.com",
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET ?? "",
};

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  return !env.supabaseUrl || !env.supabaseAnonKey;
}

export function stripeEnabled(): boolean {
  return env.stripeSecretKey.startsWith("sk_");
}
