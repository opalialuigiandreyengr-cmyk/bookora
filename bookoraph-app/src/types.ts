export type AppointmentStatus = 'pending' | 'approved' | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_note?: string;
  customer_address?: string;
  service_names: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  total_price?: string;
  final_total_amount?: number | null;
  final_amount_note?: string;
  final_amount_sent_at?: string | null;
  no_show_reason?: string;
  peg_image_path?: string | null;
  payment_receipt_path?: string | null;
  buffer_minutes?: number;
  staff_member_id?: string | null;
  location_name?: string;
  meeting_url?: string;
  recurrence_rule?: 'none' | 'weekly' | 'biweekly';
  recurrence_group_id?: string | null;
  payment_status?: 'unpaid' | 'partial' | 'paid';
  payment_paid?: number;
  payment_balance?: number;
  status: AppointmentStatus;
};

export type Client = {
  id: string;
  business_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  blocked?: boolean;
  created_at?: string;
};

export type ServiceCategory = {
  id: string;
  business_id?: string;
  name: string;
};

export type ServiceHours = Record<string, { open: boolean; start: string; end: string }>;

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  category?: string;
  category_id?: string | null;
  duration_minutes: number;
  buffer_minutes?: number;
  price: string | number;
  image_url?: string;
  show_on_booking_page?: boolean;
  deposit_type?: 'none' | 'fixed' | 'percentage';
  deposit_amount?: number;
  service_hours?: ServiceHours | null;
};

export type Payment = {
  id: string;
  business_id: string;
  appointment_id?: string | null;
  client_name: string;
  client_email?: string;
  amount: number;
  currency: string;
  transaction_type: 'payment' | 'deposit' | 'refund' | 'adjustment';
  method: 'cash' | 'card' | 'bank_transfer' | 'e_wallet' | 'other';
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  failure_reason?: string;
  retry_count?: number;
  created_at: string;
  note?: string;
};

export type StaffRole = 'owner' | 'manager' | 'staff' | 'limited';
export type StaffStatus = 'active' | 'invited' | 'paused';
export type StaffHours = { open: boolean; start: string; end: string };

export type StaffMember = {
  id: string;
  business_id?: string;
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  role: StaffRole;
  status: StaffStatus;
  working_hours: Record<string, StaffHours>;
  time_off: string[];
  service_ids: string[];
};

export type BlockTimeEvent = {
  id: string;
  business_id?: string;
  title: string;
  event_date: string;
  start_time: string;
  duration_minutes: number;
  personal_event: boolean;
  notes: string;
};

export type ServicePackage = {
  id: string;
  business_id?: string;
  name: string;
  description: string;
  service_ids: string[];
  session_count: number;
  price: number;
  active: boolean;
};

export type MembershipPlan = {
  id: string;
  business_id?: string;
  name: string;
  description: string;
  monthly_price: number;
  points_per_visit: number;
  active: boolean;
};

export type ClientMembership = {
  id: string;
  business_id?: string;
  client_id: string;
  plan_id: string | null;
  status: string;
  points_balance: number;
  clients?: { full_name: string; email: string } | null;
};

export type NotificationSettings = {
  email_enabled: boolean;
  sms_enabled: boolean;
  customer_confirmation_enabled: boolean;
  staff_confirmation_enabled: boolean;
  reminder_enabled: boolean;
  reminder_lead_hours: number;
  no_show_followup_enabled: boolean;
  no_show_followup_delay_hours: number;
  sender_name: string;
  email_signature: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

export type NotificationEvent = {
  id: string;
  event_type: string;
  channel: string;
  recipient: string;
  status: 'sent' | 'failed' | 'scheduled' | 'processing';
  provider_message: string;
  created_at: string;
};

export type ReportSchedule = {
  recipient_email: string;
  frequency: 'weekly' | 'monthly';
  send_day: number;
  time_zone: string;
  enabled: boolean;
};

export type SchedulingSettings = {
  waitlist_enabled: boolean;
  daily_capacity: number;
  resources: string[];
  private_booking_enabled: boolean;
  seasonal_availability_enabled: boolean;
};

export type ClassSession = {
  id: string;
  name: string;
  description: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  enrolled_count: number;
  status: string;
};

export type IntegrationProvider =
  | 'google_calendar'
  | 'outlook_calendar'
  | 'apple_calendar'
  | 'zoom'
  | 'webhooks'
  | 'accounting';

export type IntegrationConnection = {
  provider: IntegrationProvider;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  external_account_label: string;
  last_sync_at: string | null;
  error_message: string;
};

export type ApiToken = {
  id: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type WebhookEndpoint = {
  id: string;
  name: string;
  url: string;
  signing_secret: string;
  events: string[];
  active: boolean;
  last_delivery_at: string | null;
  last_error: string;
};

export type WebhookDelivery = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  response_status: number | null;
  created_at: string;
  error_message: string;
};

export type DaySchedule = {
  day: string;
  open: boolean;
  start: string;
  end: string;
};

export type BreakWindow = {
  start: string;
  end: string;
};

export type TimeOffRule = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  repeat: 'none' | 'weekly' | 'monthly';
};

export type BusinessProfile = {
  business_name: string;
  slug: string;
  industry: string;
  about: string;
  brand_color: string;
  theme: string;
  email: string;
  country_code: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  business_hours: DaySchedule[];
  availability_breaks: Record<string, BreakWindow[]>;
  time_off: TimeOffRule[];
  website: string;
  instagram: string;
  facebook: string;
  booking_policy: string;
  booking_min_notice_hours: number;
  booking_max_days: number;
  booking_slot_size_minutes: number;
  booking_cancellation_notice_hours: number;
  booking_buffer_minutes: number;
  booking_show_phone: boolean;
  booking_show_address: boolean;
  booking_show_notes: boolean;
  booking_show_design_peg: boolean;
  booking_show_payment_receipt: boolean;
  booking_show_price: boolean;
  booking_show_duration: boolean;
  booking_show_hours: boolean;
  booking_show_staff: boolean;
  booking_show_reviews: boolean;
  booking_allow_customer_login: boolean;
  booking_fee_enabled: boolean;
  booking_fee_type: 'fixed' | 'percentage';
  booking_fee_amount: number;
  booking_fee_note: string;
  booking_additional_info: string;
  payment_receipt_url: string;
  banner_url: string;
  logo_url: string;
  owner_name: string;
};
