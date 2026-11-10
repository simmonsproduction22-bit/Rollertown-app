import { z } from "zod";
import type { GymSettings } from "@/lib/data/types";

export const DEFAULT_SETTINGS: GymSettings = {
  cancellation: { window_hours: 12, late_cancel_fee_cents: 1500, no_show_fee_cents: 2000, late_cancel_consumes_credit: true },
  refunds: { package_refund_mode: "unused_prorated", membership_refund_days: 7, allow_staff_override: true },
  reminders: { class_hours_before: [24, 2], private_hours_before: [24, 2], channels: ["email", "sms"] },
  retention: { inactive_days: 10, package_low_credits: 2, membership_expiring_days: 14 },
  booking: { open_days_ahead: 14, waitlist_auto_promote: true, require_waiver: true },
  dunning: { retry_days: [1, 3, 5, 7], channels: ["email", "sms"] },
  packages: { default_expiration_days: 90 },
  fee_paid_by: "business",
};

const hours = z.array(z.number().int().min(0).max(168)).max(4);
const channels = z.array(z.enum(["email", "sms"])).max(2);

export const settingsSchema = z.object({
  cancellation: z.object({
    window_hours: z.number().int().min(0).max(168),
    late_cancel_fee_cents: z.number().int().min(0).max(100_000),
    no_show_fee_cents: z.number().int().min(0).max(100_000),
    late_cancel_consumes_credit: z.boolean(),
  }),
  refunds: z.object({
    package_refund_mode: z.enum(["unused_prorated", "full_if_unused", "none"]),
    membership_refund_days: z.number().int().min(0).max(90),
    allow_staff_override: z.boolean(),
  }),
  reminders: z.object({ class_hours_before: hours, private_hours_before: hours, channels }),
  retention: z.object({
    inactive_days: z.number().int().min(1).max(90),
    package_low_credits: z.number().int().min(0).max(20),
    membership_expiring_days: z.number().int().min(1).max(60),
  }),
  booking: z.object({ open_days_ahead: z.number().int().min(1).max(90), waitlist_auto_promote: z.boolean(), require_waiver: z.boolean() }),
  dunning: z.object({ retry_days: z.array(z.number().int().min(1).max(30)).max(6), channels }),
  packages: z.object({ default_expiration_days: z.number().int().min(1).max(730) }),
  fee_paid_by: z.enum(["business", "customer"]).optional(),
});

export function withDefaults(s: Partial<GymSettings> | null | undefined): GymSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) } as GymSettings;
}
