/**
 * Row types mirroring supabase/migrations. snake_case on purpose so rows move
 * between Postgres, the demo store and the API without mapping.
 */
export type UUID = string;
export type ISO = string;

export type Role = "owner" | "manager" | "front_desk" | "head_coach" | "coach" | "independent_coach" | "member" | "guardian";
export type MemberStatus = "lead" | "trial" | "active" | "frozen" | "past_due" | "cancelled";
export type BookingStatus = "booked" | "waitlisted" | "cancelled" | "late_cancelled" | "attended" | "no_show";
export type PrivateStatus = "pending_payment" | "confirmed" | "cancelled" | "late_cancelled" | "completed" | "no_show";
export type ProductKind = "membership" | "class_pack" | "lesson_pack" | "intro" | "drop_in" | "retail" | "testing_fee" | "mat_rent";
export type TxnStatus = "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
export type LeadStage = "new" | "contacted" | "trial_booked" | "trial_done" | "joined" | "lost";
export type RentModel = "none" | "flat_monthly" | "per_hour" | "per_session";
export type RoomKind = "mat" | "cage" | "ring" | "bag_area" | "other";

export interface GymSettings {
  cancellation: { window_hours: number; late_cancel_fee_cents: number; no_show_fee_cents: number; late_cancel_consumes_credit: boolean };
  refunds: { package_refund_mode: "unused_prorated" | "full_if_unused" | "none"; membership_refund_days: number; allow_staff_override: boolean };
  reminders: { class_hours_before: number[]; private_hours_before: number[]; channels: ("email" | "sms")[] };
  retention: { inactive_days: number; package_low_credits: number; membership_expiring_days: number };
  booking: { open_days_ahead: number; waitlist_auto_promote: boolean; require_waiver: boolean };
  dunning: { retry_days: number[]; channels: ("email" | "sms")[] };
  packages: { default_expiration_days: number };
  fee_paid_by?: "business" | "customer";
}

export interface Gym {
  id: UUID; name: string; slug: string; timezone: string; currency: string; email: string | null; phone: string | null;
  website: string | null; google_review_url: string | null; logo_path: string | null; brand_color: string; platform_fee_bps: number;
  stripe_account_id: string | null; stripe_charges_enabled: boolean; stripe_payouts_enabled: boolean; onboarding_step: string;
  is_public: boolean; settings: GymSettings; created_at: ISO; updated_at: ISO;
}
export interface Location { id: UUID; gym_id: UUID; name: string; address: string | null; city: string | null; region: string | null; postal: string | null; is_primary: boolean; created_at: ISO }
export interface Room { id: UUID; gym_id: UUID; location_id: UUID; name: string; kind: RoomKind; capacity: number | null; created_at: ISO }
export interface Family { id: UUID; gym_id: UUID; name: string; billing_member_id: UUID | null; created_at: ISO }
export interface Member {
  id: UUID; gym_id: UUID; user_id: UUID | null; family_id: UUID | null; home_location_id: UUID | null; first_name: string; last_name: string;
  email: string | null; phone: string | null; date_of_birth: string | null; status: MemberStatus; emergency_contact: string | null;
  medical_notes: string | null; pickup_notes: string | null; notes: string | null; tags: string[]; stripe_customer_id: string | null;
  external_ref: string | null; joined_on: string; last_attended_at: ISO | null; sms_opt_in: boolean; email_opt_in: boolean; created_at: ISO; updated_at: ISO;
}
export interface Guardian { id: UUID; gym_id: UUID; child_member_id: UUID; guardian_member_id: UUID | null; guardian_user_id: UUID | null; full_name: string; relationship: string; email: string | null; phone: string | null; can_pickup: boolean; is_primary: boolean; created_at: ISO }
export interface Coach {
  id: UUID; gym_id: UUID; user_id: UUID | null; display_name: string; slug: string; email: string | null; phone: string | null; bio: string | null;
  specialties: string[]; photo_path: string | null; color: string; employment: "staff" | "independent"; default_coach_split_bps: number;
  rent_model: RentModel; rent_amount_cents: number; stripe_account_id: string | null; stripe_payouts_enabled: boolean; accepts_privates: boolean; is_active: boolean; created_at: ISO;
}
export interface GymUser { id: UUID; gym_id: UUID; user_id: UUID; role: Role; coach_id: UUID | null; member_id: UUID | null; location_ids: UUID[] | null; invited_email: string | null; created_at: ISO }
export interface Discipline { id: UUID; gym_id: UUID; name: string; slug: string; created_at: ISO }
export interface AuditEntry { id?: number; gym_id: UUID; actor_user_id: UUID | null; actor_label: string | null; action: string; entity: string; entity_id: UUID | null; details: Record<string, unknown>; created_at: ISO }

export interface ClassType { id: UUID; gym_id: UUID; discipline_id: UUID | null; name: string; description: string | null; color: string; default_capacity: number; duration_min: number; is_kids: boolean; age_min: number | null; age_max: number | null; allow_drop_in: boolean; drop_in_price_cents: number; allow_trial: boolean; requires_rank_order: number | null; created_at: ISO }
export interface ClassSeries { id: UUID; gym_id: UUID; class_type_id: UUID; location_id: UUID | null; room_id: UUID | null; coach_id: UUID | null; weekday: number; start_time: string; duration_min: number; capacity: number; starts_on: string; ends_on: string | null; is_active: boolean; created_at: ISO }
export interface ClassSession { id: UUID; gym_id: UUID; series_id: UUID | null; class_type_id: UUID; location_id: UUID | null; room_id: UUID | null; coach_id: UUID | null; starts_at: ISO; ends_at: ISO; capacity: number; is_cancelled: boolean; notes: string | null; created_at: ISO }
export interface ClassBooking { id: UUID; gym_id: UUID; session_id: UUID; member_id: UUID; status: BookingStatus; waitlist_position: number | null; is_trial: boolean; is_drop_in: boolean; entitlement_id: UUID | null; membership_id: UUID | null; source: string; cancelled_at: ISO | null; fee_cents: number; created_at: ISO }
export interface CheckIn { id: UUID; gym_id: UUID; member_id: UUID; session_id: UUID | null; location_id: UUID | null; method: "kiosk" | "qr" | "staff" | "api"; checked_in_at: ISO; checked_in_by: UUID | null }
export interface CoachAvailability { id: UUID; gym_id: UUID; coach_id: UUID; weekday: number; start_time: string; end_time: string; location_id: UUID | null }
export interface CoachTimeOff { id: UUID; gym_id: UUID; coach_id: UUID; starts_at: ISO; ends_at: ISO; reason: string | null }
export interface LessonType { id: UUID; gym_id: UUID; coach_id: UUID | null; name: string; description: string | null; duration_min: number; price_cents: number; max_participants: number; per_person_price_cents: number | null; buffer_before_min: number; buffer_after_min: number; room_kinds: RoomKind[]; is_intro: boolean; is_active: boolean; created_at: ISO }
export interface PrivateBooking { id: UUID; gym_id: UUID; coach_id: UUID; lesson_type_id: UUID; room_id: UUID | null; starts_at: ISO; ends_at: ISO; status: PrivateStatus; booked_by_email: string | null; booked_by_name: string | null; notes: string | null; entitlement_id: UUID | null; transaction_id: UUID | null; cancelled_at: ISO | null; reminder_sent_at: ISO | null; created_at: ISO }
export interface PrivateParticipant { id: UUID; gym_id: UUID; booking_id: UUID; member_id: UUID; price_cents: number }

export interface Product { id: UUID; gym_id: UUID; coach_id: UUID | null; kind: ProductKind; name: string; description: string | null; price_cents: number; interval: "week" | "month" | "year" | null; class_credits: number | null; lesson_credits: number | null; unlimited_classes: boolean; lesson_type_id: UUID | null; expires_after_days: number | null; coach_split_bps: number | null; family_eligible: boolean; sibling_discount_bps: number; max_per_member: number | null; is_public: boolean; is_active: boolean; stripe_price_id: string | null; created_at: ISO }
export interface Membership { id: UUID; gym_id: UUID; member_id: UUID; product_id: UUID; family_id: UUID | null; status: "active" | "frozen" | "past_due" | "cancelled" | "expired"; price_cents: number; discount_bps: number; started_on: string; current_period_end: string; cancel_at_period_end: boolean; cancelled_on: string | null; stripe_subscription_id: string | null; failed_payment_count: number; created_at: ISO }
export interface MembershipHold { id: UUID; gym_id: UUID; membership_id: UUID; starts_on: string; ends_on: string; reason: string | null; fee_cents: number; created_at: ISO }
export interface Entitlement { id: UUID; gym_id: UUID; member_id: UUID; product_id: UUID; coach_id: UUID | null; transaction_id: UUID | null; kind: "class" | "lesson"; credits_total: number; credits_used: number; amount_paid_cents: number; purchased_at: ISO; expires_at: ISO | null; status: "active" | "exhausted" | "expired" | "refunded"; migrated: boolean }
export interface CreditLedger { id?: number; gym_id: UUID; entitlement_id: UUID; delta: number; reason: string; ref_id: UUID | null; created_at: ISO }
export interface PaymentMethod { id: UUID; gym_id: UUID; member_id: UUID; stripe_payment_method_id: string | null; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; is_default: boolean; source: "new" | "migrated" | "updater"; created_at: ISO }
export interface Transaction { id: UUID; gym_id: UUID; member_id: UUID | null; coach_id: UUID | null; product_id: UUID | null; membership_id: UUID | null; description: string; subtotal_cents: number; discount_cents: number; platform_fee_cents: number; total_cents: number; refunded_cents: number; status: TxnStatus; payer_email: string | null; stripe_payment_intent_id: string | null; stripe_charge_id: string | null; transfer_group: string | null; failure_reason: string | null; attempt_count: number; next_retry_at: ISO | null; receipt_number: string | null; created_at: ISO }
export interface TransactionItem { id: UUID; gym_id: UUID; transaction_id: UUID; product_id: UUID | null; inventory_item_id: UUID | null; name: string; quantity: number; unit_price_cents: number }
export interface Split { id: UUID; gym_id: UUID; transaction_id: UUID; party: "gym" | "coach" | "platform"; coach_id: UUID | null; amount_cents: number; reversed_cents: number; stripe_transfer_id: string | null; payout_id: UUID | null; created_at: ISO }
export interface Refund { id: UUID; gym_id: UUID; transaction_id: UUID; amount_cents: number; reason: string; credits_action: "restore" | "remove" | "none"; credits_changed: number; policy_applied: string | null; was_override: boolean; stripe_refund_id: string | null; created_by: UUID | null; created_at: ISO }
export interface Payout { id: UUID; gym_id: UUID; party: "gym" | "coach" | "platform"; coach_id: UUID | null; amount_cents: number; status: "scheduled" | "in_transit" | "paid" | "failed"; arrival_date: string | null; stripe_payout_id: string | null; created_at: ISO }
export interface MatRentCharge { id: UUID; gym_id: UUID; coach_id: UUID; period_start: string; period_end: string; model: RentModel; units: number; amount_cents: number; status: "pending" | "collected" | "failed" | "waived"; collected_from: "payout_offset" | "card"; transaction_id: UUID | null; created_at: ISO }
export interface DunningAttempt { id: UUID; gym_id: UUID; transaction_id: UUID; attempt: number; channel: "email" | "sms" | "retry"; outcome: string; created_at: ISO }
export interface CardMigration { id: UUID; gym_id: UUID; source_system: "mindbody" | "zen_planner" | "booksy" | "gymdesk" | "other"; source_processor: string | null; status: "not_started" | "requested" | "export_in_progress" | "received" | "mapping" | "completed" | "failed"; requested_at: ISO | null; completed_at: ISO | null; cards_expected: number | null; cards_imported: number; cards_unmatched: number; notes: string | null; created_at: ISO }
export interface CardMigrationRecord { id: UUID; gym_id: UUID; migration_id: UUID; source_customer_id: string; stripe_customer_id: string | null; stripe_payment_method_id: string | null; email: string | null; matched_member_id: UUID | null; status: "pending" | "matched" | "unmatched" | "attached" | "error"; error: string | null }
export interface InventoryItem { id: UUID; gym_id: UUID; location_id: UUID | null; name: string; sku: string | null; category: string; price_cents: number; stock: number; low_stock_threshold: number; is_active: boolean; created_at: ISO }

export interface WaiverTemplate { id: UUID; gym_id: UUID; title: string; version: number; body: string; is_current: boolean; required: boolean; created_at: ISO }
export interface WaiverSignature { id: UUID; gym_id: UUID; template_id: UUID; template_version: number; member_id: UUID; signer_name: string; signer_relationship: "self" | "parent" | "guardian"; signer_email: string | null; signature_svg: string; ip_address: string | null; user_agent: string | null; pdf_path: string | null; signed_at: ISO }
export interface RankSystem { id: UUID; gym_id: UUID; discipline_id: UUID | null; name: string; style: "bjj" | "bjj_kids" | "muay_thai" | "karate" | "custom"; uses_stripes: boolean; created_at: ISO }
export interface Rank { id: UUID; gym_id: UUID; system_id: UUID; name: string; color: string; sort_order: number; max_stripes: number; min_classes: number; min_months: number; classes_per_stripe: number | null; months_per_stripe: number | null; requirements: string | null }
export interface MemberRank { id: UUID; gym_id: UUID; member_id: UUID; system_id: UUID; rank_id: UUID; stripes: number; awarded_on: string; last_stripe_on: string | null }
export interface Promotion { id: UUID; gym_id: UUID; member_id: UUID; system_id: UUID; from_rank_id: UUID | null; to_rank_id: UUID; from_stripes: number | null; to_stripes: number; awarded_by_coach_id: UUID | null; testing_event_id: UUID | null; notes: string | null; promoted_on: string }
export interface Technique { id: UUID; gym_id: UUID; discipline_id: UUID | null; rank_id: UUID | null; name: string; category: string | null; video_url: string | null; notes: string | null; created_at: ISO }
export interface TestingEvent { id: UUID; gym_id: UUID; system_id: UUID | null; name: string; starts_at: ISO; location_id: UUID | null; fee_cents: number; capacity: number | null; status: "open" | "closed" | "completed"; created_at: ISO }
export interface TestingRegistration { id: UUID; gym_id: UUID; event_id: UUID; member_id: UUID; target_rank_id: UUID | null; transaction_id: UUID | null; paid: boolean; result: "pass" | "fail" | "incomplete" | null; certificate_path: string | null; created_at: ISO }

export interface Fighter { id: UUID; gym_id: UUID; member_id: UUID; nickname: string | null; disciplines: string[]; weight_class: string; walk_weight_lb: number | null; height_in: number | null; reach_in: number | null; stance: "orthodox" | "southpaw" | "switch" | null; is_pro: boolean; active: boolean; created_at: ISO }
export interface FightEvent { id: UUID; gym_id: UUID; name: string; promotion: string | null; event_date: string; venue: string | null; city: string | null; weigh_in_at: ISO | null; created_at: ISO }
export interface Fight { id: UUID; gym_id: UUID; fighter_id: UUID; event_id: UUID | null; event_name: string | null; fight_date: string; opponent: string; discipline: string; level: "amateur" | "pro"; weight_class: string | null; result: "win" | "loss" | "draw" | "nc" | null; method: string | null; round: number | null; time: string | null; notes: string | null }
export interface WeighIn { id: UUID; gym_id: UUID; fighter_id: UUID; weighed_on: string; weight_lb: number; target_lb: number | null; is_official: boolean; notes: string | null }
export interface FightCamp { id: UUID; gym_id: UUID; fighter_id: UUID; fight_id: UUID | null; starts_on: string; ends_on: string; target_weight_lb: number | null; plan: { week: number; focus: string; sessions: string[] }[]; created_at: ISO }
export interface FighterDocument { id: UUID; gym_id: UUID; fighter_id: UUID; kind: "medical" | "license" | "bloodwork" | "eye_exam" | "id" | "other"; title: string; file_path: string | null; issued_on: string | null; expires_on: string | null; created_at: ISO }

export interface Lead { id: UUID; gym_id: UUID; first_name: string; last_name: string | null; email: string | null; phone: string | null; interest: string | null; source: string; stage: LeadStage; owner_coach_id: UUID | null; member_id: UUID | null; trial_session_id: UUID | null; lost_reason: string | null; notes: string | null; created_at: ISO; stage_changed_at: ISO }
export interface LeadForm { id: UUID; gym_id: UUID; name: string; fields: string[]; thank_you: string; is_active: boolean; created_at: ISO }
export interface MessageThread { id: UUID; gym_id: UUID; coach_id: UUID | null; member_id: UUID | null; lead_id: UUID | null; contact_name: string; contact_phone: string | null; contact_email: string | null; last_message_at: ISO; unread_count: number; is_archived: boolean }
export interface Message { id: UUID; gym_id: UUID; thread_id: UUID; direction: "inbound" | "outbound"; channel: "sms" | "email" | "in_app"; body: string; status: string; provider_id: string | null; sent_by_user: UUID | null; automation_id: UUID | null; created_at: ISO }
export interface AutomationStep { delay_hours: number; channel: "sms" | "email"; template: string }
export interface Automation { id: UUID; gym_id: UUID; name: string; trigger: string; steps: AutomationStep[]; is_active: boolean; created_at: ISO }
export interface AutomationRun { id: UUID; gym_id: UUID; automation_id: UUID; member_id: UUID | null; lead_id: UUID | null; step_index: number; next_run_at: ISO | null; status: "running" | "completed" | "stopped"; created_at: ISO }
export interface OutboxItem { id: UUID; gym_id: UUID; channel: "sms" | "email"; to_address: string; subject: string | null; body: string; category: string; ref_id: UUID | null; send_after: ISO; sent_at: ISO | null; status: "queued" | "sent" | "failed" | "cancelled"; error: string | null; created_at: ISO }
export interface ImportJob { id: UUID; gym_id: UUID; source_system: string; entity: string; file_name: string | null; mapping: Record<string, string>; status: string; row_count: number; imported_count: number; error_count: number; errors: unknown[]; created_by: UUID | null; created_at: ISO }
export interface ApiKey { id: UUID; gym_id: UUID; name: string; key_prefix: string; key_hash: string; scopes: string[]; last_used_at: ISO | null; revoked_at: ISO | null; created_at: ISO }
export interface WebhookEndpoint { id: UUID; gym_id: UUID; url: string; events: string[]; secret: string; is_active: boolean; created_at: ISO }
export interface WebhookDelivery { id?: number; gym_id: UUID; endpoint_id: UUID; event: string; payload: unknown; status_code: number | null; attempt: number; delivered_at: ISO | null; created_at: ISO }

/** Table name → row type. The Store is typed by this map. */
export interface Tables {
  gyms: Gym; locations: Location; rooms: Room; families: Family; members: Member; guardians: Guardian; coaches: Coach;
  gym_users: GymUser; disciplines: Discipline; audit_log: AuditEntry;
  class_types: ClassType; class_series: ClassSeries; class_sessions: ClassSession; class_bookings: ClassBooking; check_ins: CheckIn;
  coach_availability: CoachAvailability; coach_time_off: CoachTimeOff; lesson_types: LessonType; private_bookings: PrivateBooking;
  private_booking_participants: PrivateParticipant;
  products: Product; memberships: Membership; membership_holds: MembershipHold; entitlements: Entitlement; credit_ledger: CreditLedger;
  payment_methods: PaymentMethod; transactions: Transaction; transaction_items: TransactionItem; splits: Split; refunds: Refund;
  payouts: Payout; mat_rent_charges: MatRentCharge; dunning_attempts: DunningAttempt; card_migrations: CardMigration;
  card_migration_records: CardMigrationRecord; inventory_items: InventoryItem;
  waiver_templates: WaiverTemplate; waiver_signatures: WaiverSignature; rank_systems: RankSystem; ranks: Rank; member_ranks: MemberRank;
  promotions: Promotion; techniques: Technique; testing_events: TestingEvent; testing_registrations: TestingRegistration;
  fighters: Fighter; fight_events: FightEvent; fights: Fight; weigh_ins: WeighIn; fight_camps: FightCamp; fighter_documents: FighterDocument;
  leads: Lead; lead_forms: LeadForm; message_threads: MessageThread; messages: Message; automations: Automation; automation_runs: AutomationRun;
  notifications_outbox: OutboxItem; import_jobs: ImportJob; api_keys: ApiKey; webhook_endpoints: WebhookEndpoint; webhook_deliveries: WebhookDelivery;
}
export type TableName = keyof Tables;
