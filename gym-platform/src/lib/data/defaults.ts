import type { TableName } from "./types";

/** Column defaults the demo store applies on insert (mirrors SQL defaults). */
export function defaultsFor(table: TableName): Record<string, unknown> {
  const now = new Date().toISOString();
  const base: Record<string, unknown> = { created_at: now };
  switch (table) {
    case "members":
      return { ...base, updated_at: now, status: "active", tags: [], sms_opt_in: true, email_opt_in: true, joined_on: now.slice(0, 10), user_id: null, family_id: null, home_location_id: null, email: null, phone: null, date_of_birth: null, emergency_contact: null, medical_notes: null, pickup_notes: null, notes: null, stripe_customer_id: null, external_ref: null, last_attended_at: null };
    case "class_bookings":
      return { ...base, status: "booked", waitlist_position: null, is_trial: false, is_drop_in: false, entitlement_id: null, membership_id: null, source: "app", cancelled_at: null, fee_cents: 0 };
    case "check_ins":
      return { checked_in_at: now, session_id: null, location_id: null, checked_in_by: null };
    case "transactions":
      return { ...base, member_id: null, coach_id: null, product_id: null, membership_id: null, discount_cents: 0, platform_fee_cents: 0, refunded_cents: 0, status: "pending", payer_email: null, stripe_payment_intent_id: null, stripe_charge_id: null, transfer_group: null, failure_reason: null, attempt_count: 1, next_retry_at: null, receipt_number: null };
    case "splits":
      return { ...base, reversed_cents: 0, stripe_transfer_id: null, payout_id: null, coach_id: null };
    case "entitlements":
      return { purchased_at: now, credits_used: 0, status: "active", migrated: false, coach_id: null, transaction_id: null, expires_at: null };
    case "credit_ledger":
    case "audit_log":
      return { ...base, ref_id: null, details: {} };
    case "messages":
      return { ...base, status: "sent", provider_id: null, sent_by_user: null, automation_id: null };
    case "message_threads":
      return { last_message_at: now, unread_count: 0, is_archived: false, coach_id: null, member_id: null, lead_id: null, contact_phone: null, contact_email: null };
    case "leads":
      return { ...base, stage: "new", stage_changed_at: now, source: "web_form", last_name: null, email: null, phone: null, interest: null, owner_coach_id: null, member_id: null, trial_session_id: null, lost_reason: null, notes: null };
    case "notifications_outbox":
      return { ...base, send_after: now, sent_at: null, status: "queued", error: null, subject: null, ref_id: null };
    case "private_bookings":
      return { ...base, status: "confirmed", room_id: null, booked_by_email: null, booked_by_name: null, notes: null, entitlement_id: null, transaction_id: null, cancelled_at: null, reminder_sent_at: null };
    case "refunds":
      return { ...base, credits_action: "none", credits_changed: 0, policy_applied: null, was_override: false, stripe_refund_id: null, created_by: null };
    default:
      return base;
  }
}
