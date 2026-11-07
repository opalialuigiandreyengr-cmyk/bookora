import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { sendAppointmentUpdateEmail } from '@/lib/appointment-notifications';
import { resolveAppointmentServices, validateAppointmentSchedule } from '@/lib/appointment-scheduling';
import { createAuthCallbackUrl, type OAuthSignInResult, parseAuthCallbackUrl } from '@/lib/auth-callback';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type {
  ApiToken,
  Appointment,
  AppointmentStatus,
  BlockTimeEvent,
  BusinessProfile,
  ClassSession,
  Client,
  ClientMembership,
  DaySchedule,
  IntegrationConnection,
  IntegrationProvider,
  MembershipPlan,
  NotificationEvent,
  NotificationSettings,
  Payment,
  ReportSchedule,
  SchedulingSettings,
  Service,
  ServiceCategory,
  ServicePackage,
  StaffHours,
  StaffMember,
  StaffRole,
  StaffStatus,
  WebhookDelivery,
  WebhookEndpoint,
} from '@/types';

WebBrowser.maybeCompleteAuthSession();

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DEFAULT_BUSINESS_HOURS: DaySchedule[] = DAY_NAMES.map((day, index) => ({
  day,
  open: index < 5,
  start: '09:00',
  end: '17:00',
}));

export const DEFAULT_STAFF_HOURS: Record<string, StaffHours> = Object.fromEntries(
  DAY_NAMES.map((day, index) => [day, { open: index < 5, start: '09:00', end: '17:00' }])
);

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  email_enabled: true,
  sms_enabled: false,
  customer_confirmation_enabled: true,
  staff_confirmation_enabled: false,
  reminder_enabled: true,
  reminder_lead_hours: 24,
  no_show_followup_enabled: false,
  no_show_followup_delay_hours: 24,
  sender_name: 'Bookora',
  email_signature: '',
  quiet_hours_start: '',
  quiet_hours_end: '',
};

export const DEFAULT_SCHEDULING_SETTINGS: SchedulingSettings = {
  waitlist_enabled: true,
  daily_capacity: 0,
  resources: [],
  private_booking_enabled: false,
  seasonal_availability_enabled: false,
};

const createDefaultReportSchedule = (email = ''): ReportSchedule => ({
  recipient_email: email,
  frequency: 'weekly',
  send_day: 1,
  time_zone: 'Asia/Manila',
  enabled: false,
});

export function createDefaultBusinessProfile(session: Session | null): BusinessProfile {
  const meta = session?.user.user_metadata ?? {};
  const cached = (meta.business_profile as Record<string, unknown> | undefined) ?? meta;
  const rawName = String(cached.business_name ?? meta.business_name ?? session?.user.email?.split('@')[0] ?? 'Your business');
  const rawSlug = String(cached.slug ?? meta.slug ?? rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  return {
    business_name: rawName,
    slug: rawSlug,
    industry: String(cached.industry ?? meta.industry ?? 'Nail salon'),
    about: String(cached.about ?? meta.about ?? ''),
    brand_color: String(cached.brand_color ?? meta.brand_color ?? 'coral'),
    theme: String(cached.theme ?? meta.theme ?? 'Light'),
    email: String(cached.email ?? session?.user.email ?? ''),
    country_code: String(cached.country_code ?? meta.country_code ?? '+63'),
    phone: String(cached.phone ?? meta.phone ?? ''),
    address: String(cached.address ?? meta.address ?? ''),
    city: String(cached.city ?? meta.city ?? ''),
    country: String(cached.country ?? meta.country ?? 'Philippines'),
    business_hours: Array.isArray(cached.business_hours)
      ? (cached.business_hours as DaySchedule[])
      : DEFAULT_BUSINESS_HOURS,
    availability_breaks:
      cached.availability_breaks && typeof cached.availability_breaks === 'object'
        ? (cached.availability_breaks as BusinessProfile['availability_breaks'])
        : {},
    time_off: Array.isArray(cached.time_off)
      ? (cached.time_off as BusinessProfile['time_off'])
      : [],
    website: String(cached.website ?? meta.website ?? ''),
    instagram: String(cached.instagram ?? meta.instagram ?? ''),
    facebook: String(cached.facebook ?? meta.facebook ?? ''),
    booking_policy: String(cached.booking_policy ?? meta.booking_policy ?? ''),
    booking_min_notice_hours: Number(cached.booking_min_notice_hours ?? 2),
    booking_max_days: Number(cached.booking_max_days ?? 60),
    booking_slot_size_minutes: Number(cached.booking_slot_size_minutes ?? 30),
    booking_cancellation_notice_hours: Number(cached.booking_cancellation_notice_hours ?? 24),
    booking_buffer_minutes: Number(cached.booking_buffer_minutes ?? 0),
    booking_show_phone: Boolean(cached.booking_show_phone ?? true),
    booking_show_address: Boolean(cached.booking_show_address ?? false),
    booking_show_notes: Boolean(cached.booking_show_notes ?? true),
    booking_show_design_peg: Boolean(cached.booking_show_design_peg ?? true),
    booking_show_payment_receipt: Boolean(cached.booking_show_payment_receipt ?? false),
    booking_show_price: Boolean(cached.booking_show_price ?? true),
    booking_show_duration: Boolean(cached.booking_show_duration ?? true),
    booking_show_hours: Boolean(cached.booking_show_hours ?? true),
    booking_show_staff: Boolean(cached.booking_show_staff ?? true),
    booking_show_reviews: Boolean(cached.booking_show_reviews ?? true),
    booking_allow_customer_login: Boolean(cached.booking_allow_customer_login ?? true),
    booking_fee_enabled: Boolean(cached.booking_fee_enabled ?? false),
    booking_fee_type: cached.booking_fee_type === 'percentage' ? 'percentage' : 'fixed',
    booking_fee_amount: Number(cached.booking_fee_amount ?? 200),
    booking_fee_note: String(
      cached.booking_fee_note ??
        'A reservation deposit is required to confirm your booking. This amount will be deducted from your final bill at the appointment.'
    ),
    booking_additional_info: String(
      cached.booking_additional_info ??
        'Prices vary depending on design complexity. Your final quote will be confirmed after reviewing your request.'
    ),
    payment_receipt_url: String(cached.payment_receipt_url ?? ''),
    banner_url: String(cached.banner_url ?? ''),
    logo_url: String(cached.logo_url ?? ''),
    owner_name: String(cached.owner_name ?? meta.full_name ?? 'Owner'),
  };
}

export type NewClient = {
  full_name: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  blocked?: boolean;
};

export type NewPayment = {
  appointment_id?: string | null;
  client_name: string;
  client_email?: string;
  amount: number;
  transaction_type: Payment['transaction_type'];
  method: Payment['method'];
  status: Payment['status'];
  note?: string;
};

export type NewAppointment = {
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
  buffer_minutes?: number;
  staff_member_id?: string | null;
  location_name?: string;
  meeting_url?: string;
  recurrence_rule?: 'none' | 'weekly' | 'biweekly';
  recurrence_group_id?: string | null;
  peg_image_path?: string | null;
  payment_receipt_path?: string | null;
  status?: AppointmentStatus;
};

export type AppointmentCreateResult = {
  appointment: Appointment | null;
  error: string | null;
};

export type NewService = {
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
};

type AppContextValue = {
  session: Session | null;
  configured: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  appointments: Appointment[];
  clients: Client[];
  services: Service[];
  categories: ServiceCategory[];
  payments: Payment[];
  staff: StaffMember[];
  blockEvents: BlockTimeEvent[];
  packages: ServicePackage[];
  membershipPlans: MembershipPlan[];
  clientMemberships: ClientMembership[];
  notificationSettings: NotificationSettings;
  notificationEvents: NotificationEvent[];
  reportSchedule: ReportSchedule;
  schedulingSettings: SchedulingSettings;
  classSessions: ClassSession[];
  integrationConnections: IntegrationConnection[];
  apiTokens: ApiToken[];
  webhookEndpoints: WebhookEndpoint[];
  webhookDeliveries: WebhookDelivery[];
  businessProfile: BusinessProfile;
  businessName: string;
  publicBookingUrl: string;
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (payload: { email: string; password: string }) => Promise<string | null>;
  completeOnboarding: (payload: {
    brandName: string;
    industry: string;
    phone: string;
    timeZone: string;
    currency: string;
  }) => Promise<string | null>;
  signInWithGoogle: () => Promise<OAuthSignInResult>;
  resetPassword: (email: string) => Promise<string | null>;
  changePassword: (newPassword: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  // Clients
  addClient: (client: NewClient) => Promise<string | null>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<string | null>;
  deleteClient: (id: string) => Promise<string | null>;
  mergeClients: (survivor: Client, duplicate: Client) => Promise<string | null>;
  // Payments
  addPayment: (payment: NewPayment) => Promise<string | null>;
  updatePaymentStatus: (id: string, status: Payment['status']) => Promise<string | null>;
  retryPayment: (id: string) => Promise<string | null>;
  // Appointments
  addAppointment: (appointment: NewAppointment) => Promise<AppointmentCreateResult>;
  updateAppointmentStatus: (id: string, status: AppointmentStatus, noShowReason?: string) => Promise<string | null>;
  bulkUpdateAppointmentStatus: (ids: string[], status: AppointmentStatus) => Promise<string | null>;
  updateAppointment: (id: string, updates: Partial<Appointment>) => Promise<string | null>;
  updateAppointmentFinalAmount: (id: string, amount: number, note: string, sendEmail?: boolean) => Promise<string | null>;
  collectPayment: (appointment: Appointment, payment: { amount: number; method: string; note: string }) => Promise<string | null>;
  deleteAppointment: (id: string) => Promise<string | null>;
  // Services & Categories
  addService: (service: NewService) => Promise<string | null>;
  updateService: (id: string, updates: Partial<NewService>) => Promise<string | null>;
  deleteService: (id: string) => Promise<string | null>;
  duplicateService: (service: Service) => Promise<string | null>;
  toggleService: (id: string, visible: boolean) => Promise<string | null>;
  addCategory: (name: string) => Promise<string | null>;
  updateCategory: (id: string, name: string) => Promise<string | null>;
  deleteCategory: (id: string) => Promise<string | null>;
  // Staff
  saveStaffMember: (member: StaffMember) => Promise<string | null>;
  deleteStaffMember: (id: string) => Promise<string | null>;
  // Block time
  addBlockTime: (draft: Omit<BlockTimeEvent, 'id' | 'business_id'>) => Promise<string | null>;
  deleteBlockTime: (id: string) => Promise<string | null>;
  // Packages
  addPackage: (draft: Omit<ServicePackage, 'id' | 'business_id'>) => Promise<string | null>;
  deletePackage: (id: string) => Promise<string | null>;
  // Memberships
  addMembershipPlan: (draft: Omit<MembershipPlan, 'id' | 'business_id'>) => Promise<string | null>;
  deleteMembershipPlan: (id: string) => Promise<string | null>;
  enrollClientMembership: (clientId: string, planId: string) => Promise<string | null>;
  // Notifications
  saveNotificationSettings: (settings: NotificationSettings) => Promise<string | null>;
  retryNotificationEvent: (eventId: string) => Promise<string | null>;
  // Reports
  saveReportSchedule: (schedule: ReportSchedule) => Promise<string | null>;
  // Advanced Scheduling & Classes
  saveSchedulingSettings: (settings: SchedulingSettings) => Promise<string | null>;
  addClassSession: (draft: Omit<ClassSession, 'id' | 'enrolled_count' | 'status'>) => Promise<string | null>;
  deleteClassSession: (id: string) => Promise<string | null>;
  // Integrations & Webhooks
  toggleIntegrationConnection: (provider: IntegrationProvider) => Promise<string | null>;
  rotateCalendarFeedToken: () => Promise<{ url?: string; error?: string }>;
  issueApiToken: (scope: 'webhooks:write' | 'api:read' | 'api:write') => Promise<{ token?: string; error?: string }>;
  revokeApiToken: (tokenId: string) => Promise<string | null>;
  saveWebhookEndpoint: (endpoint: WebhookEndpoint) => Promise<string | null>;
  deleteWebhookEndpoint: (id: string) => Promise<string | null>;
  // Business Profile
  saveBusinessProfile: (profile: Partial<BusinessProfile>) => Promise<string | null>;
};

const AppContext = createContext<AppContextValue | null>(null);

function normalizeStaffRow(row: Record<string, unknown>): StaffMember {
  const roleStr = String(row.role || 'staff');
  const statusStr = String(row.status || 'invited');
  const role: StaffRole = ['owner', 'manager', 'staff', 'limited'].includes(roleStr) ? (roleStr as StaffRole) : 'staff';
  const status: StaffStatus = ['active', 'invited', 'paused'].includes(statusStr) ? (statusStr as StaffStatus) : 'invited';
  return {
    id: String(row.id || ''),
    business_id: String(row.business_id || ''),
    full_name: String(row.full_name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    bio: String(row.bio || ''),
    role,
    status,
    working_hours:
      row.working_hours && typeof row.working_hours === 'object'
        ? (row.working_hours as Record<string, StaffHours>)
        : { ...DEFAULT_STAFF_HOURS },
    time_off: Array.isArray(row.time_off) ? row.time_off.map(String) : [],
    service_ids: [],
  };
}

function hydrateAppointmentsWithPayments(rawAppointments: Appointment[], rawPayments: Payment[]): Appointment[] {
  const paidByAppointment = new Map<string, number>();
  for (const payment of rawPayments) {
    if (!payment.appointment_id || payment.status !== 'paid') continue;
    const delta = payment.transaction_type === 'refund' ? -Number(payment.amount || 0) : Number(payment.amount || 0);
    paidByAppointment.set(payment.appointment_id, (paidByAppointment.get(payment.appointment_id) || 0) + delta);
  }
  return rawAppointments.map((appt) => {
    const paid = Math.max(0, paidByAppointment.get(appt.id) || 0);
    const totalNum =
      appt.final_total_amount != null
        ? Number(appt.final_total_amount)
        : Number(String(appt.total_price || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const balance = Math.max(0, totalNum - paid);
    const paymentStatus: Appointment['payment_status'] =
      paid <= 0 ? 'unpaid' : balance <= 0 && totalNum > 0 ? 'paid' : 'partial';
    return {
      ...appt,
      payment_paid: paid,
      payment_balance: balance,
      payment_status: paymentStatus,
    };
  });
}

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [blockEvents, setBlockEvents] = useState<BlockTimeEvent[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [clientMemberships, setClientMemberships] = useState<ClientMembership[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [reportSchedule, setReportSchedule] = useState<ReportSchedule>(() => createDefaultReportSchedule());
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings>(DEFAULT_SCHEDULING_SETTINGS);
  const [classSessions, setClassSessions] = useState<ClassSession[]>([]);
  const [integrationConnections, setIntegrationConnections] = useState<IntegrationConnection[]>([]);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [webhookEndpoints, setWebhookEndpoints] = useState<WebhookEndpoint[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(() => createDefaultBusinessProfile(null));
  const [hasBusinessProfileRow, setHasBusinessProfileRow] = useState(false);
  const loadedBusinessId = useRef<string | null>(null);
  const loadRequestId = useRef(0);

  const resetWorkspaceState = useCallback((activeSession: Session | null) => {
    setAppointments([]);
    setClients([]);
    setServices([]);
    setCategories([]);
    setPayments([]);
    setStaff([]);
    setBlockEvents([]);
    setPackages([]);
    setMembershipPlans([]);
    setClientMemberships([]);
    setNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
    setNotificationEvents([]);
    setReportSchedule(createDefaultReportSchedule(activeSession?.user.email || ''));
    setSchedulingSettings({ ...DEFAULT_SCHEDULING_SETTINGS });
    setClassSessions([]);
    setIntegrationConnections([]);
    setApiTokens([]);
    setWebhookEndpoints([]);
    setWebhookDeliveries([]);
    setBusinessProfile(createDefaultBusinessProfile(activeSession));
    setHasBusinessProfileRow(false);
  }, []);

  const load = useCallback(async (activeSession: Session | null) => {
    const businessId = activeSession?.user.id;
    if (!supabase || !businessId) {
      if (!supabase) setError('Supabase is not configured. Add the required Expo public environment variables.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const requestId = ++loadRequestId.current;
    if (loadedBusinessId.current !== businessId) {
      resetWorkspaceState(activeSession);
      loadedBusinessId.current = businessId;
    }
    setError('');
    setBusinessProfile(createDefaultBusinessProfile(activeSession));
    setReportSchedule((prev) => ({
      ...prev,
      recipient_email: prev.recipient_email || activeSession.user.email || '',
    }));

    // Primary tables
    const [appointmentResult, clientResult, serviceResult, paymentResult] = await Promise.all([
      supabase.from('appointments').select('*').eq('business_id', businessId).order('appointment_date').order('appointment_time'),
      supabase.from('clients').select('*').eq('business_id', businessId).order('full_name'),
      supabase.from('services').select('*').eq('business_id', businessId).order('name'),
      supabase.from('payment_transactions').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    ]);

    if (requestId !== loadRequestId.current) return;

    const failure = appointmentResult.error ?? clientResult.error ?? serviceResult.error ?? paymentResult.error;
    if (failure) {
      setError(failure.message);
    } else {
      const nextPayments = (paymentResult.data ?? []) as Payment[];
      const nextAppointments = hydrateAppointmentsWithPayments((appointmentResult.data ?? []) as Appointment[], nextPayments);
      setPayments(nextPayments);
      setAppointments(nextAppointments);
      setClients(
        ((clientResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          business_id: String(row.business_id || businessId),
          full_name: String(row.full_name || ''),
          email: String(row.email || ''),
          phone: String(row.phone || ''),
          notes: String(row.notes || ''),
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
          blocked: Boolean(row.blocked),
          created_at: String(row.created_at || ''),
        }))
      );
      setServices((serviceResult.data ?? []) as Service[]);
    }

    // Secondary / module tables (loaded resiliently so missing optional tables never block core workspace)
    try {
      const [
        catRes,
        profileRes,
        staffRes,
        blockRes,
        pkgRes,
        planRes,
        memRes,
        notifSetRes,
        notifEvtRes,
        repSchedRes,
        schedSetRes,
        classRes,
        intConnRes,
        tokenRes,
        whEndRes,
        whDelRes,
      ] = await Promise.all([
        supabase.from('service_categories').select('id, name').eq('business_id', businessId).order('created_at'),
        supabase.from('business_profiles').select('*').eq('id', businessId).maybeSingle(),
        supabase.from('staff_members').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('block_time_events').select('*').eq('business_id', businessId).order('event_date').order('start_time'),
        supabase.from('service_packages').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('membership_plans').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('client_memberships').select('id, client_id, plan_id, status, points_balance, clients(full_name, email)').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('notification_settings').select('*').eq('business_id', businessId).maybeSingle(),
        supabase.from('notification_events').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(15),
        supabase.from('report_schedules').select('*').eq('business_id', businessId).maybeSingle(),
        supabase.from('scheduling_settings').select('*').eq('business_id', businessId).maybeSingle(),
        supabase.from('class_sessions').select('*').eq('business_id', businessId).order('session_date').order('start_time'),
        supabase.from('integration_connections').select('*').eq('business_id', businessId),
        supabase.from('api_tokens').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('integration_webhook_endpoints').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('integration_webhook_deliveries').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(20),
      ]);

      if (requestId !== loadRequestId.current) return;

      if (!catRes.error && catRes.data) {
        const nextCats = catRes.data as ServiceCategory[];
        setCategories(nextCats);
        setServices((current) =>
          current.map((svc) => ({
            ...svc,
            category: svc.category || nextCats.find((c) => c.id === svc.category_id)?.name || 'General',
          }))
        );
      }

      if (!profileRes.error && profileRes.data) {
        const d = profileRes.data as Record<string, unknown>;
        setHasBusinessProfileRow(Boolean(d.business_name));
        setBusinessProfile((prev) => ({
          ...prev,
          business_name: String(d.business_name ?? prev.business_name),
          slug: String(d.slug ?? prev.slug),
          industry: String(d.industry ?? prev.industry),
          about: String(d.about ?? prev.about),
          brand_color: String(d.brand_color ?? prev.brand_color),
          theme: String(d.theme ?? prev.theme),
          email: String(d.email ?? prev.email),
          country_code: String(d.country_code ?? prev.country_code),
          phone: String(d.phone ?? prev.phone),
          address: String(d.address ?? prev.address),
          city: String(d.city ?? prev.city),
          country: String(d.country ?? prev.country),
          business_hours: Array.isArray(d.business_hours) ? (d.business_hours as DaySchedule[]) : prev.business_hours,
          availability_breaks:
            d.availability_breaks && typeof d.availability_breaks === 'object'
              ? (d.availability_breaks as BusinessProfile['availability_breaks'])
              : prev.availability_breaks,
          time_off: Array.isArray(d.time_off)
            ? (d.time_off as BusinessProfile['time_off'])
            : prev.time_off,
          website: String(d.website ?? prev.website),
          instagram: String(d.instagram ?? prev.instagram),
          facebook: String(d.facebook ?? prev.facebook),
          booking_policy: String(d.booking_policy ?? prev.booking_policy),
          booking_min_notice_hours: Number(d.booking_min_notice_hours ?? prev.booking_min_notice_hours),
          booking_max_days: Number(d.booking_max_days ?? prev.booking_max_days),
          booking_slot_size_minutes: Number(d.booking_slot_size_minutes ?? prev.booking_slot_size_minutes),
          booking_cancellation_notice_hours: Number(d.booking_cancellation_notice_hours ?? prev.booking_cancellation_notice_hours),
          booking_buffer_minutes: Number(d.booking_buffer_minutes ?? prev.booking_buffer_minutes),
          booking_show_phone: Boolean(d.booking_show_phone ?? prev.booking_show_phone),
          booking_show_address: Boolean(d.booking_show_address ?? prev.booking_show_address),
          booking_show_notes: Boolean(d.booking_show_notes ?? prev.booking_show_notes),
          booking_show_design_peg: Boolean(d.booking_show_design_peg ?? prev.booking_show_design_peg),
          booking_show_payment_receipt: Boolean(d.booking_show_payment_receipt ?? prev.booking_show_payment_receipt),
          booking_show_price: Boolean(d.booking_show_price ?? prev.booking_show_price),
          booking_show_duration: Boolean(d.booking_show_duration ?? prev.booking_show_duration),
          booking_show_hours: Boolean(d.booking_show_hours ?? prev.booking_show_hours),
          booking_show_staff: Boolean(d.booking_show_staff ?? prev.booking_show_staff),
          booking_show_reviews: Boolean(d.booking_show_reviews ?? prev.booking_show_reviews),
          booking_allow_customer_login: Boolean(d.booking_allow_customer_login ?? prev.booking_allow_customer_login),
          booking_fee_enabled: Boolean(d.booking_fee_enabled ?? prev.booking_fee_enabled),
          booking_fee_type: d.booking_fee_type === 'percentage' ? 'percentage' : 'fixed',
          booking_fee_amount: Number(d.booking_fee_amount ?? prev.booking_fee_amount),
          booking_fee_note: String(d.booking_fee_note ?? prev.booking_fee_note),
          booking_additional_info: String(d.booking_additional_info ?? prev.booking_additional_info),
          payment_receipt_url: String(d.payment_receipt_url ?? prev.payment_receipt_url),
          banner_url: String(d.banner_url ?? prev.banner_url),
          logo_url: String(d.logo_url ?? prev.logo_url),
          owner_name: String(d.owner_name ?? prev.owner_name),
        }));
      }

      if (!staffRes.error && staffRes.data) {
        const staffRows = (staffRes.data as Record<string, unknown>[]).map(normalizeStaffRow);
        if (staffRows.length) {
          const assignRes = await supabase
            .from('staff_service_assignments')
            .select('staff_id, service_id')
            .in(
              'staff_id',
              staffRows.map((m) => m.id)
            );
          for (const assign of assignRes.data ?? []) {
            const target = staffRows.find((m) => m.id === String(assign.staff_id));
            if (target) target.service_ids.push(String(assign.service_id));
          }
        }
        setStaff(staffRows);
      }

      if (!blockRes.error && blockRes.data) setBlockEvents(blockRes.data as BlockTimeEvent[]);
      if (!pkgRes.error && pkgRes.data) setPackages(pkgRes.data as ServicePackage[]);
      if (!planRes.error && planRes.data) setMembershipPlans(planRes.data as MembershipPlan[]);
      if (!memRes.error && memRes.data) setClientMemberships(memRes.data as unknown as ClientMembership[]);
      if (!notifSetRes.error && notifSetRes.data) {
        setNotificationSettings({
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(notifSetRes.data as Partial<NotificationSettings>),
          quiet_hours_start: String(notifSetRes.data.quiet_hours_start || '').slice(0, 5),
          quiet_hours_end: String(notifSetRes.data.quiet_hours_end || '').slice(0, 5),
        });
      }
      if (!notifEvtRes.error && notifEvtRes.data) setNotificationEvents(notifEvtRes.data as NotificationEvent[]);
      if (!repSchedRes.error && repSchedRes.data) {
        setReportSchedule({
          recipient_email: String(repSchedRes.data.recipient_email || activeSession.user.email || ''),
          frequency: repSchedRes.data.frequency === 'monthly' ? 'monthly' : 'weekly',
          send_day: Number(repSchedRes.data.send_day) || 1,
          time_zone: String(repSchedRes.data.time_zone || 'Asia/Manila'),
          enabled: Boolean(repSchedRes.data.enabled),
        });
      }
      if (!schedSetRes.error && schedSetRes.data) {
        setSchedulingSettings({
          ...DEFAULT_SCHEDULING_SETTINGS,
          ...(schedSetRes.data as Partial<SchedulingSettings>),
        });
      }
      if (!classRes.error && classRes.data) setClassSessions(classRes.data as ClassSession[]);
      if (!intConnRes.error && intConnRes.data) setIntegrationConnections(intConnRes.data as IntegrationConnection[]);
      if (!tokenRes.error && tokenRes.data) setApiTokens(tokenRes.data as ApiToken[]);
      if (!whEndRes.error && whEndRes.data) setWebhookEndpoints(whEndRes.data as WebhookEndpoint[]);
      if (!whDelRes.error && whDelRes.data) setWebhookDeliveries(whDelRes.data as WebhookDelivery[]);
    } catch {
      // Optional secondary tables may not exist in older schemas
    }

    setLoading(false);
    setRefreshing(false);
  }, [resetWorkspaceState]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void load(data.session);
      else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void load(next);
      else {
        loadRequestId.current += 1;
        loadedBusinessId.current = null;
        resetWorkspaceState(null);
        setError('');
        setLoading(false);
        setRefreshing(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load, resetWorkspaceState]);

  const businessId = session?.user.id;
  const refresh = async () => {
    setRefreshing(true);
    await load(session);
  };

  const signIn = async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured on this build.';
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    return signInError?.message ?? null;
  };

  const signUp = async (payload: { email: string; password: string }) => {
    if (!supabase) return 'Supabase is not configured on this build.';
    const { error: signUpError } = await supabase.auth.signUp({
      email: payload.email.trim(),
      password: payload.password,
      options: {
        data: {
          account_type: 'business',
          role: 'business',
        },
      },
    });
    return signUpError?.message ?? null;
  };

  const completeOnboarding = async (payload: {
    brandName: string;
    industry: string;
    phone: string;
    timeZone: string;
    currency: string;
  }) => {
    if (!supabase || !businessId) return 'You must be signed in to complete onboarding.';
    const cleanName = payload.brandName.trim() || 'Your business';
    const cleanSlug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const industryLabelMap: Record<string, string> = {
      'nail-salon': 'Nail salon',
      'hair-salon': 'Hair salon',
      barbershop: 'Barbershop',
      'facial-spa': 'Facial & spa',
      'makeup-studio': 'Makeup studio',
      'beauty-clinic': 'Beauty clinic',
    };
    const industryLabel = industryLabelMap[payload.industry] || payload.industry || 'Nail salon';

    const { data: userRes, error: authError } = await supabase.auth.updateUser({
      data: {
        business_name: cleanName,
        slug: cleanSlug,
        industry: payload.industry,
        phone: payload.phone.trim(),
        time_zone: payload.timeZone,
        currency: payload.currency,
        onboarding_complete: true,
      },
    });
    if (authError) return authError.message;

    if (userRes.user && session) {
      setSession({ ...session, user: userRes.user });
    }

    const saveErr = await saveBusinessProfile({
      business_name: cleanName,
      slug: cleanSlug,
      industry: industryLabel,
      phone: payload.phone.trim(),
    });
    if (saveErr) return saveErr;
    setHasBusinessProfileRow(true);
    return null;
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      return { status: 'error', message: 'Supabase is not configured on this build.' } as const;
    }

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const webRedirectTo = `${window.location.origin}/app`;
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: webRedirectTo,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });
        if (oauthError) return { status: 'error', message: oauthError.message } as const;
        return { status: 'cancelled' } as const;
      }

      const redirectTo = createAuthCallbackUrl();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) return { status: 'error', message: oauthError.message } as const;
      if (!data.url) {
        return { status: 'error', message: 'Google sign-in could not be started.' } as const;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' } as const;
      if (result.type !== 'success') {
        return { status: 'error', message: 'Google sign-in was not completed. Please try again.' } as const;
      }

      const callback = parseAuthCallbackUrl(result.url);
      if (callback.errorDescription || callback.error) {
        return {
          status: 'error',
          message: callback.errorDescription ?? callback.error ?? 'Google sign-in failed.',
        } as const;
      }

      if (callback.code) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchangeError) return { status: 'error', message: exchangeError.message } as const;
        if (!exchangeData.session) {
          return { status: 'error', message: 'Google sign-in did not return a valid session.' } as const;
        }
        return { status: 'success' } as const;
      }

      if (!callback.accessToken || !callback.refreshToken) {
        return { status: 'error', message: 'Google sign-in did not return a valid session.' } as const;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
      if (sessionError) return { status: 'error', message: sessionError.message } as const;
      if (!sessionData.session) {
        return { status: 'error', message: 'Google sign-in did not return a valid session.' } as const;
      }
      return { status: 'success' } as const;
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Google sign-in could not be completed.',
      } as const;
    }
  };

  const resetPassword = async (email: string) => {
    if (!supabase) return 'Supabase is not configured on this build.';
    const redirectTo = createAuthCallbackUrl({ mode: 'recovery' });
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return resetError?.message ?? null;
  };

  const changePassword = async (newPassword: string) => {
    if (!supabase) return 'Supabase is not configured on this build.';
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_updated_at: new Date().toISOString() },
    });
    return updateError?.message ?? null;
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  // --- Clients ---
  const addClient = async (draft: NewClient) => {
    if (!supabase || !businessId) return 'You must be signed in to add a client.';
    const payload = {
      business_id: businessId,
      full_name: draft.full_name.trim(),
      email: (draft.email || '').trim(),
      phone: (draft.phone || '').trim(),
      notes: (draft.notes || '').trim(),
      tags: (draft.tags || []).map((t) => t.trim()).filter(Boolean),
      blocked: Boolean(draft.blocked),
    };
    const { data, error: saveError } = await supabase.from('clients').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    setClients((current) => [data as Client, ...current]);
    return null;
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    if (!supabase || !businessId) return 'You must be signed in to update a client.';
    const payload = {
      full_name: updates.full_name?.trim(),
      email: updates.email?.trim(),
      phone: updates.phone?.trim(),
      notes: updates.notes?.trim(),
      tags: updates.tags?.map((t) => t.trim()).filter(Boolean),
      blocked: updates.blocked,
    };
    const { data, error: saveError } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .single();
    if (saveError) return saveError.message;
    setClients((current) => current.map((item) => (item.id === id ? (data as Client) : item)));
    return null;
  };

  const deleteClient = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete a client.';
    const { error: delError } = await supabase.from('clients').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setClients((current) => current.filter((item) => item.id !== id));
    return null;
  };

  const mergeClients = async (survivor: Client, duplicate: Client) => {
    if (!supabase || !businessId) return 'You must be signed in to merge clients.';
    const tags = Array.from(new Set([...(survivor.tags || []), ...(duplicate.tags || [])].filter(Boolean)));
    const notes = [survivor.notes, duplicate.notes].filter(Boolean).join('\n\n');
    const survivorUpdate = await supabase
      .from('clients')
      .update({ notes, tags })
      .eq('id', survivor.id)
      .eq('business_id', businessId);
    if (survivorUpdate.error) return survivorUpdate.error.message;

    if (duplicate.email && survivor.email && duplicate.email.toLowerCase() !== survivor.email.toLowerCase()) {
      await supabase
        .from('appointments')
        .update({
          customer_email: survivor.email,
          customer_name: survivor.full_name,
          customer_phone: survivor.phone || '',
        })
        .eq('business_id', businessId)
        .eq('customer_email', duplicate.email);
    }
    const deleted = await supabase.from('clients').delete().eq('id', duplicate.id).eq('business_id', businessId);
    if (deleted.error) return deleted.error.message;
    setClients((current) =>
      current
        .filter((c) => c.id !== duplicate.id)
        .map((c) => (c.id === survivor.id ? { ...c, notes, tags } : c))
    );
    return null;
  };

  // --- Payments ---
  const addPayment = async (draft: NewPayment) => {
    if (!supabase || !businessId) return 'You must be signed in to record a payment.';
    const payload = {
      business_id: businessId,
      appointment_id: draft.appointment_id || null,
      client_name: draft.client_name.trim(),
      client_email: (draft.client_email || '').trim(),
      amount: Math.round(Number(draft.amount) * 100) / 100,
      currency: 'PHP',
      transaction_type: draft.transaction_type,
      method: draft.method,
      status: draft.status,
      note: (draft.note || '').trim(),
    };
    const { data, error: saveError } = await supabase.from('payment_transactions').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    const saved = data as Payment;
    setPayments((current) => {
      const next = [saved, ...current];
      setAppointments((appts) => hydrateAppointmentsWithPayments(appts, next));
      return next;
    });
    return null;
  };

  const updatePaymentStatus = async (id: string, status: Payment['status']) => {
    if (!supabase || !businessId) return 'You must be signed in to update payment.';
    const { data, error: saveError } = await supabase
      .from('payment_transactions')
      .update({ status })
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .single();
    if (saveError) return saveError.message;
    const updated = data as Payment;
    setPayments((current) => {
      const next = current.map((p) => (p.id === id ? updated : p));
      setAppointments((appts) => hydrateAppointmentsWithPayments(appts, next));
      return next;
    });
    return null;
  };

  const retryPayment = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to retry a payment.';
    const rpcRes = await supabase.rpc('retry_payment_transaction', { p_payment_id: id });
    if (rpcRes.error) return `The payment provider did not accept the retry: ${rpcRes.error.message}`;
    if (!rpcRes.data) return 'The payment provider did not confirm that the retry was queued.';
    setPayments((current) => current.map((p) => (p.id === id ? { ...p, status: 'pending' } : p)));
    return null;
  };

  // --- Appointments ---
  const addAppointment = async (draft: NewAppointment) => {
    if (!supabase || !businessId) {
      return { appointment: null, error: 'You must be signed in to add an appointment.' };
    }
    if (!services.length) {
      return { appointment: null, error: 'Add a service before creating an appointment.' };
    }
    const selectedServices = resolveAppointmentServices(draft.service_names, services);
    if (!selectedServices.length) {
      return { appointment: null, error: 'Choose a service from your current service list.' };
    }
    const scheduleError = validateAppointmentSchedule(draft, {
      businessProfile,
      appointments,
      blockEvents,
      services,
    });
    if (scheduleError) return { appointment: null, error: scheduleError };
    const { data, error: saveError } = await supabase
      .from('appointments')
      .insert({
        ...draft,
        business_id: businessId,
        customer_email: draft.customer_email || '',
        customer_phone: draft.customer_phone || '',
        total_price: draft.total_price || '₱0',
        buffer_minutes: draft.buffer_minutes || 0,
        status: draft.status || 'approved',
      })
      .select('*')
      .single();
    if (saveError) return { appointment: null, error: saveError.message };
    const appointment = data as Appointment;
    setAppointments((current) => hydrateAppointmentsWithPayments([...current, appointment], payments));
    return { appointment, error: null };
  };

  const updateAppointmentStatus = async (id: string, status: AppointmentStatus, noShowReason = '') => {
    if (!supabase || !businessId) return 'You must be signed in to update an appointment.';
    const payload: { status: AppointmentStatus; no_show_reason?: string } = { status };
    if (status === 'no_show') payload.no_show_reason = noShowReason;
    const { error: saveError } = await supabase.from('appointments').update(payload).eq('id', id).eq('business_id', businessId);
    if (saveError) return saveError.message;
    setAppointments((current) =>
      current.map((item) => (item.id === id ? { ...item, status, no_show_reason: payload.no_show_reason ?? item.no_show_reason } : item))
    );

    if (status === 'cancelled') {
      void sendAppointmentUpdateEmail({ businessId, appointmentId: id, eventType: 'cancellation' });
    } else if (status === 'approved') {
      void sendAppointmentUpdateEmail({ businessId, appointmentId: id, eventType: 'booking_confirmation' });
    }
    return null;
  };

  const bulkUpdateAppointmentStatus = async (ids: string[], status: AppointmentStatus) => {
    if (!supabase || !businessId || !ids.length) return 'Select at least one appointment.';
    const { error: saveError } = await supabase
      .from('appointments')
      .update({ status, no_show_reason: '' })
      .in('id', ids)
      .eq('business_id', businessId);
    if (saveError) return saveError.message;
    setAppointments((current) => current.map((item) => (ids.includes(item.id) ? { ...item, status } : item)));
    return null;
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    if (!supabase || !businessId) return 'You must be signed in to update an appointment.';
    const currentAppointment = appointments.find((item) => item.id === id);
    if (!currentAppointment) return 'This appointment is no longer available.';
    const nextAppointment = { ...currentAppointment, ...updates };
    const scheduleChanged =
      updates.appointment_date !== undefined ||
      updates.appointment_time !== undefined ||
      updates.duration_minutes !== undefined ||
      updates.buffer_minutes !== undefined ||
      updates.service_names !== undefined;
    if (scheduleChanged) {
      const scheduleError = validateAppointmentSchedule(nextAppointment, {
        businessProfile,
        appointments,
        blockEvents,
        services,
        excludeAppointmentId: id,
      });
      if (scheduleError) return scheduleError;
    }
    const { data, error: saveError } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .single();
    if (saveError) return saveError.message;
    setAppointments((current) =>
      hydrateAppointmentsWithPayments(
        current.map((item) => (item.id === id ? (data as Appointment) : item)),
        payments
      )
    );
    return null;
  };

  const updateAppointmentFinalAmount = async (id: string, amount: number, note: string, sendEmail = false) => {
    if (!supabase || !businessId) return 'You must be signed in to update final amount.';
    const rounded = Math.round(amount * 100) / 100;
    const payload: Partial<Appointment> = {
      final_total_amount: rounded,
      final_amount_note: note.trim(),
    };
    if (sendEmail) {
      payload.final_amount_sent_at = new Date().toISOString();
    }
    const { error: saveError } = await supabase.from('appointments').update(payload).eq('id', id).eq('business_id', businessId);
    if (saveError) return saveError.message;
    setAppointments((current) =>
      hydrateAppointmentsWithPayments(
        current.map((item) => (item.id === id ? { ...item, ...payload } : item)),
        payments
      )
    );
    if (sendEmail) {
      void sendAppointmentUpdateEmail({ businessId, appointmentId: id, eventType: 'final_amount' });
    }
    return null;
  };

  const collectPayment = async (appointment: Appointment, payment: { amount: number; method: string; note: string }) => {
    if (!supabase || !businessId) return 'You must be signed in to collect payment.';
    let savedPayment: Payment | null = null;
    if (payment.amount > 0) {
      const { data: paymentRow, error: paymentError } = await supabase
        .from('payment_transactions')
        .insert({
          business_id: businessId,
          appointment_id: appointment.id,
          client_name: appointment.customer_name,
          client_email: appointment.customer_email || '',
          amount: Math.round(payment.amount * 100) / 100,
          currency: 'PHP',
          transaction_type: 'payment',
          method: payment.method,
          status: 'paid',
          note: payment.note,
        })
        .select('*')
        .single();
      if (paymentError) return paymentError.message;
      savedPayment = paymentRow as Payment;
    }

    const { error: completionError } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', appointment.id)
      .eq('business_id', businessId)
      .select('id')
      .single();
    if (completionError) {
      if (savedPayment) {
        const rollback = await supabase
          .from('payment_transactions')
          .delete()
          .eq('id', savedPayment.id)
          .eq('business_id', businessId);
        if (rollback.error) {
          return `The payment was recorded, but the appointment could not be completed. Please review payment ${savedPayment.id}.`;
        }
      }
      return completionError.message;
    }

    if (savedPayment) {
      setPayments((current) => {
        const next = [savedPayment as Payment, ...current];
        setAppointments((appts) =>
          hydrateAppointmentsWithPayments(
            appts.map((item) => (item.id === appointment.id ? { ...item, status: 'completed' } : item)),
            next
          )
        );
        return next;
      });
    } else {
      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? { ...item, status: 'completed' } : item))
      );
    }
    return null;
  };

  const deleteAppointment = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete an appointment.';
    const { error: deleteError } = await supabase.from('appointments').delete().eq('id', id).eq('business_id', businessId);
    if (deleteError) return deleteError.message;
    setAppointments((current) => current.filter((item) => item.id !== id));
    return null;
  };

  // --- Services & Categories ---
  const addService = async (draft: NewService) => {
    if (!supabase || !businessId) return 'You must be signed in to add a service.';
    const categoryObj = categories.find((c) => c.id === draft.category_id || c.name === draft.category);
    const basePayload = {
      business_id: businessId,
      name: draft.name.trim(),
      duration_minutes: Math.max(5, Number(draft.duration_minutes) || 60),
      buffer_minutes: Math.max(0, Number(draft.buffer_minutes) || 0),
      price: typeof draft.price === 'number' ? `₱${draft.price}` : String(draft.price || 'Free'),
      category_id: categoryObj?.id ?? null,
      image_url: draft.image_url || '',
      show_on_booking_page: draft.show_on_booking_page ?? true,
      deposit_type: draft.deposit_type || 'none',
      deposit_amount: Math.max(0, Number(draft.deposit_amount) || 0),
    };
    let result = await supabase
      .from('services')
      .insert({ ...basePayload, description: (draft.description || '').trim() })
      .select('*')
      .single();
    if (result.error && (result.error.message.includes('description') || result.error.message.includes('column'))) {
      result = await supabase.from('services').insert(basePayload).select('*').single();
    }
    if (result.error) return result.error.message;
    const saved = {
      ...(result.data as Service),
      category: categoryObj?.name || draft.category || 'General',
    };
    setServices((current) => [...current, saved]);
    return null;
  };

  const updateService = async (id: string, updates: Partial<NewService>) => {
    if (!supabase || !businessId) return 'You must be signed in to update a service.';
    const categoryObj = categories.find((c) => c.id === updates.category_id || c.name === updates.category);
    const basePayload: Record<string, unknown> = {
      name: updates.name?.trim(),
      duration_minutes: updates.duration_minutes != null ? Math.max(5, Number(updates.duration_minutes) || 60) : undefined,
      buffer_minutes: updates.buffer_minutes != null ? Math.max(0, Number(updates.buffer_minutes) || 0) : undefined,
      price: updates.price != null ? (typeof updates.price === 'number' ? `₱${updates.price}` : String(updates.price)) : undefined,
      category_id: categoryObj?.id ?? updates.category_id ?? null,
      show_on_booking_page: updates.show_on_booking_page,
      deposit_type: updates.deposit_type,
      deposit_amount: updates.deposit_amount != null ? Math.max(0, Number(updates.deposit_amount) || 0) : undefined,
    };
    Object.keys(basePayload).forEach((k) => basePayload[k] === undefined && delete basePayload[k]);

    let result = await supabase
      .from('services')
      .update({ ...basePayload, ...(updates.description !== undefined ? { description: updates.description.trim() } : {}) })
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .single();

    if (result.error && (result.error.message.includes('description') || result.error.message.includes('column'))) {
      result = await supabase.from('services').update(basePayload).eq('id', id).eq('business_id', businessId).select('*').single();
    }
    if (result.error) return result.error.message;
    const saved = {
      ...(result.data as Service),
      category: categoryObj?.name || updates.category || 'General',
    };
    setServices((current) => current.map((item) => (item.id === id ? saved : item)));
    return null;
  };

  const deleteService = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete a service.';
    const { error: delError } = await supabase.from('services').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setServices((current) => current.filter((item) => item.id !== id));
    return null;
  };

  const duplicateService = async (service: Service) => {
    return addService({
      name: `${service.name} copy`,
      description: service.description,
      category: service.category,
      category_id: service.category_id,
      duration_minutes: service.duration_minutes,
      buffer_minutes: service.buffer_minutes,
      price: service.price,
      show_on_booking_page: service.show_on_booking_page,
      deposit_type: service.deposit_type,
      deposit_amount: service.deposit_amount,
    });
  };

  const toggleService = async (id: string, visible: boolean) => {
    if (!supabase || !businessId) return 'You must be signed in to update a service.';
    const { error: saveError } = await supabase
      .from('services')
      .update({ show_on_booking_page: visible })
      .eq('id', id)
      .eq('business_id', businessId);
    if (saveError) return saveError.message;
    setServices((current) => current.map((item) => (item.id === id ? { ...item, show_on_booking_page: visible } : item)));
    return null;
  };

  const addCategory = async (name: string) => {
    if (!supabase || !businessId) return 'You must be signed in to add a category.';
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a category name.';
    const { data, error: saveError } = await supabase
      .from('service_categories')
      .insert({ business_id: businessId, name: trimmed })
      .select('id, name')
      .single();
    if (saveError) return saveError.message;
    setCategories((current) => [...current, data as ServiceCategory]);
    return null;
  };

  const updateCategory = async (id: string, name: string) => {
    if (!supabase || !businessId) return 'You must be signed in to update a category.';
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a category name.';
    const { error: saveError } = await supabase
      .from('service_categories')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('business_id', businessId);
    if (saveError) return saveError.message;
    setCategories((current) => current.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    setServices((current) => current.map((s) => (s.category_id === id ? { ...s, category: trimmed } : s)));
    return null;
  };

  const deleteCategory = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete a category.';
    const { error: delError } = await supabase.from('service_categories').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setCategories((current) => current.filter((c) => c.id !== id));
    setServices((current) =>
      current.map((s) => (s.category_id === id ? { ...s, category_id: null, category: 'General' } : s))
    );
    return null;
  };

  // --- Staff ---
  const saveStaffMember = async (draft: StaffMember) => {
    if (!supabase || !businessId) return 'You must be signed in to save staff.';
    if (!draft.full_name.trim() || !draft.email.trim()) return 'Add a name and email first.';
    const payload = {
      business_id: businessId,
      full_name: draft.full_name.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      bio: draft.bio.trim(),
      role: draft.role,
      status: draft.status,
      working_hours: draft.working_hours,
      time_off: draft.time_off,
    };
    const result = draft.id
      ? await supabase.from('staff_members').update(payload).eq('id', draft.id).eq('business_id', businessId).select('*').single()
      : await supabase.from('staff_members').insert(payload).select('*').single();

    if (result.error) return result.error.message;
    const saved = normalizeStaffRow(result.data as Record<string, unknown>);
    await supabase.from('staff_service_assignments').delete().eq('staff_id', saved.id);
    if (draft.service_ids.length) {
      await supabase
        .from('staff_service_assignments')
        .insert(draft.service_ids.map((serviceId) => ({ staff_id: saved.id, service_id: serviceId })));
    }
    saved.service_ids = draft.service_ids;
    setStaff((current) => (draft.id ? current.map((m) => (m.id === draft.id ? saved : m)) : [...current, saved]));

    if (saved.status === 'invited') {
      void supabase.functions.invoke('send-staff-invite', {
        body: {
          staffMemberId: saved.id,
          email: saved.email,
          fullName: saved.full_name,
          businessName: businessProfile.business_name,
          redirectTo: 'https://bookoraph.com/auth',
        },
      });
    }
    return null;
  };

  const deleteStaffMember = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to remove staff.';
    const { error: delError } = await supabase.from('staff_members').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setStaff((current) => current.filter((m) => m.id !== id));
    return null;
  };

  // --- Block Time ---
  const addBlockTime = async (draft: Omit<BlockTimeEvent, 'id' | 'business_id'>) => {
    if (!supabase || !businessId) return 'You must be signed in to block time.';
    const payload = {
      business_id: businessId,
      title: draft.title.trim(),
      event_date: draft.event_date,
      start_time: draft.start_time,
      duration_minutes: Math.max(5, Number(draft.duration_minutes) || 60),
      personal_event: Boolean(draft.personal_event),
      notes: (draft.notes || '').trim(),
    };
    const { data, error: saveError } = await supabase.from('block_time_events').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    setBlockEvents((current) =>
      [...current, data as BlockTimeEvent].sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`))
    );
    return null;
  };

  const deleteBlockTime = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to remove blocked time.';
    const { error: delError } = await supabase.from('block_time_events').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setBlockEvents((current) => current.filter((item) => item.id !== id));
    return null;
  };

  // --- Packages ---
  const addPackage = async (draft: Omit<ServicePackage, 'id' | 'business_id'>) => {
    if (!supabase || !businessId) return 'You must be signed in to create a package.';
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      service_ids: draft.service_ids,
      session_count: Math.max(1, Number(draft.session_count) || 1),
      price: Math.max(0, Number(draft.price) || 0),
      active: draft.active ?? true,
    };
    const { data, error: saveError } = await supabase.from('service_packages').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    setPackages((current) => [data as ServicePackage, ...current]);
    return null;
  };

  const deletePackage = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete a package.';
    const { error: delError } = await supabase.from('service_packages').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setPackages((current) => current.filter((item) => item.id !== id));
    return null;
  };

  // --- Memberships ---
  const addMembershipPlan = async (draft: Omit<MembershipPlan, 'id' | 'business_id'>) => {
    if (!supabase || !businessId) return 'You must be signed in to create a membership plan.';
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      monthly_price: Math.max(0, Number(draft.monthly_price) || 0),
      points_per_visit: Math.max(0, Number(draft.points_per_visit) || 1),
      active: draft.active ?? true,
    };
    const { data, error: saveError } = await supabase.from('membership_plans').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    setMembershipPlans((current) => [data as MembershipPlan, ...current]);
    return null;
  };

  const deleteMembershipPlan = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to remove a membership plan.';
    const { error: delError } = await supabase.from('membership_plans').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setMembershipPlans((current) => current.filter((item) => item.id !== id));
    return null;
  };

  const enrollClientMembership = async (clientId: string, planId: string) => {
    if (!supabase || !businessId) return 'You must be signed in to enroll a client.';
    const { data, error: saveError } = await supabase
      .from('client_memberships')
      .upsert(
        {
          business_id: businessId,
          client_id: clientId,
          plan_id: planId,
          status: 'active',
          points_balance: 0,
        },
        { onConflict: 'business_id,client_id' }
      )
      .select('id, client_id, plan_id, status, points_balance, clients(full_name, email)')
      .single();
    if (saveError) return saveError.message;
    setClientMemberships((current) => [
      data as unknown as ClientMembership,
      ...current.filter((m) => m.client_id !== clientId),
    ]);
    return null;
  };

  // --- Notifications ---
  const saveNotificationSettings = async (next: NotificationSettings) => {
    if (!supabase || !businessId) return 'You must be signed in to save notification settings.';
    const payload = {
      business_id: businessId,
      ...next,
      sms_enabled: false,
      staff_confirmation_enabled: false,
      sender_name: next.sender_name.trim() || businessProfile.business_name,
      email_signature: next.email_signature.trim(),
      quiet_hours_start: next.quiet_hours_start || null,
      quiet_hours_end: next.quiet_hours_end || null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('notification_settings').upsert(payload, { onConflict: 'business_id' });
    if (saveError) return saveError.message;
    setNotificationSettings(next);
    return null;
  };

  const retryNotificationEvent = async (eventId: string) => {
    if (!supabase) return 'Supabase is not configured.';
    const { data, error: rpcError } = await supabase.rpc('retry_notification_event', { p_event_id: eventId });
    if (rpcError) return rpcError.message;
    if (!data) return 'This notification reached the retry limit.';
    setNotificationEvents((current) => current.map((e) => (e.id === eventId ? { ...e, status: 'scheduled' } : e)));
    return null;
  };

  // --- Reports ---
  const saveReportSchedule = async (next: ReportSchedule) => {
    if (!supabase || !businessId) return 'You must be signed in to save report schedules.';
    const payload = {
      business_id: businessId,
      ...next,
      recipient_email: next.recipient_email.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('report_schedules').upsert(payload, { onConflict: 'business_id' });
    if (saveError) return saveError.message;
    setReportSchedule(next);
    return null;
  };

  // --- Advanced Scheduling & Classes ---
  const saveSchedulingSettings = async (next: SchedulingSettings) => {
    if (!supabase || !businessId) return 'You must be signed in to save scheduling settings.';
    const { error: saveError } = await supabase
      .from('scheduling_settings')
      .upsert({ business_id: businessId, ...next }, { onConflict: 'business_id' });
    if (saveError) return saveError.message;
    setSchedulingSettings(next);
    return null;
  };

  const addClassSession = async (draft: Omit<ClassSession, 'id' | 'enrolled_count' | 'status'>) => {
    if (!supabase || !businessId) return 'You must be signed in to add a class session.';
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      session_date: draft.session_date,
      start_time: draft.start_time,
      duration_minutes: Math.max(5, Number(draft.duration_minutes) || 60),
      capacity: Math.max(1, Number(draft.capacity) || 10),
      enrolled_count: 0,
      status: 'scheduled',
    };
    const { data, error: saveError } = await supabase.from('class_sessions').insert(payload).select('*').single();
    if (saveError) return saveError.message;
    setClassSessions((current) =>
      [...current, data as ClassSession].sort((a, b) => `${a.session_date}${a.start_time}`.localeCompare(`${b.session_date}${b.start_time}`))
    );
    return null;
  };

  const deleteClassSession = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to remove a class session.';
    const { error: delError } = await supabase.from('class_sessions').delete().eq('id', id).eq('business_id', businessId);
    if (delError) return delError.message;
    setClassSessions((current) => current.filter((item) => item.id !== id));
    return null;
  };

  // --- Integrations & Webhooks ---
  const toggleIntegrationConnection = async (provider: IntegrationProvider) => {
    if (!supabase || !businessId) return 'You must be signed in to manage integrations.';
    const existing = integrationConnections.find((c) => c.provider === provider);
    const isConnected = existing?.status === 'connected';
    const next: IntegrationConnection = {
      provider,
      status: isConnected ? 'disconnected' : 'pending',
      external_account_label: isConnected ? '' : 'Connection pending',
      last_sync_at: isConnected ? null : existing?.last_sync_at ?? null,
      error_message: '',
    };
    const { error: saveError } = await supabase
      .from('integration_connections')
      .upsert({ business_id: businessId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'business_id,provider' });
    if (saveError) return saveError.message;
    setIntegrationConnections((current) => [...current.filter((c) => c.provider !== provider), next]);
    return null;
  };

  const rotateCalendarFeedToken = async () => {
    if (!supabase || !businessId) return { error: 'You must be signed in.' };
    const { data, error: rpcError } = await supabase.rpc('rotate_calendar_feed_token');
    if (rpcError || !data) return { error: rpcError?.message || 'Could not generate calendar feed token.' };
    const baseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    return { url: `${baseUrl}/functions/v1/calendar-feed?token=${encodeURIComponent(String(data))}` };
  };

  const issueApiToken = async (scope: 'webhooks:write' | 'api:read' | 'api:write') => {
    if (!supabase || !businessId) return { error: 'You must be signed in.' };
    const { data, error: rpcError } = await supabase.rpc('issue_api_token', { p_scopes: [scope] });
    if (rpcError) return { error: rpcError.message };
    const issued = (Array.isArray(data) ? data[0] : data) as { token?: string } | null;
    if (!issued?.token) return { error: 'API token response was incomplete.' };
    const refreshed = await supabase
      .from('api_tokens')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (!refreshed.error && refreshed.data) setApiTokens(refreshed.data as ApiToken[]);
    return { token: issued.token };
  };

  const revokeApiToken = async (tokenId: string) => {
    if (!supabase || !businessId) return 'You must be signed in.';
    const { error: rpcError } = await supabase.rpc('revoke_api_token', { p_token_id: tokenId });
    if (rpcError) return rpcError.message;
    setApiTokens((current) =>
      current.map((t) => (t.id === tokenId ? { ...t, revoked_at: new Date().toISOString() } : t))
    );
    return null;
  };

  const saveWebhookEndpoint = async (draft: WebhookEndpoint) => {
    if (!supabase || !businessId) return 'You must be signed in to save a webhook.';
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      url: draft.url.trim(),
      signing_secret: draft.signing_secret.trim(),
      events: draft.events,
      active: draft.active,
      updated_at: new Date().toISOString(),
    };
    const result = draft.id
      ? await supabase
          .from('integration_webhook_endpoints')
          .update(payload)
          .eq('id', draft.id)
          .eq('business_id', businessId)
          .select('*')
          .single()
      : await supabase.from('integration_webhook_endpoints').insert(payload).select('*').single();
    if (result.error) return result.error.message;
    const saved = result.data as WebhookEndpoint;
    setWebhookEndpoints((current) =>
      draft.id ? current.map((e) => (e.id === draft.id ? saved : e)) : [saved, ...current]
    );
    return null;
  };

  const deleteWebhookEndpoint = async (id: string) => {
    if (!supabase || !businessId) return 'You must be signed in to delete a webhook.';
    const { error: delError } = await supabase
      .from('integration_webhook_endpoints')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    if (delError) return delError.message;
    setWebhookEndpoints((current) => current.filter((e) => e.id !== id));
    return null;
  };

  // --- Business Profile ---
  const saveBusinessProfile = async (updates: Partial<BusinessProfile>) => {
    if (!supabase || !businessId) return 'You must be signed in to save settings.';
    const merged: BusinessProfile = {
      ...businessProfile,
      ...updates,
      business_name: (updates.business_name ?? businessProfile.business_name).trim() || 'Your business',
      slug:
        (updates.slug ?? businessProfile.slug).trim() ||
        (updates.business_name ?? businessProfile.business_name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };
    const profilePayload = {
      ...merged,
      updated_at: new Date().toISOString(),
    };

    let { error: dbError } = await supabase.from('business_profiles').upsert({
      id: businessId,
      ...profilePayload,
    });
    if (dbError && dbError.message?.includes('booking_fee')) {
      const {
        booking_fee_enabled: _bfe,
        booking_fee_type: _bft,
        booking_fee_amount: _bfa,
        booking_fee_note: _bfn,
        ...legacyPayload
      } = profilePayload;
      const legacyResult = await supabase.from('business_profiles').upsert({
        id: businessId,
        ...legacyPayload,
      });
      dbError = legacyResult.error;
    }
    if (dbError) return dbError.message;

    setBusinessProfile(merged);
    await supabase.auth.updateUser({
      data: {
        business_name: merged.business_name,
        slug: merged.slug,
        industry: merged.industry,
        phone: merged.phone,
        business_profile: null,
      },
    });
    return null;
  };

  const businessName = businessProfile.business_name || String(session?.user.user_metadata?.business_name ?? session?.user.email?.split('@')[0] ?? 'Your business');
  const activeSlug = businessProfile.slug || businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bookora';
  const publicBookingUrl = `https://${activeSlug}.bookoraph.com/`;
  const needsOnboarding = Boolean(
    session &&
      !loading &&
      !session.user.user_metadata?.onboarding_complete &&
      !hasBusinessProfileRow
  );

  const value: AppContextValue = {
    session,
    configured: supabaseConfigured,
    loading,
    refreshing,
    error,
    appointments,
    clients,
    services,
    categories,
    payments,
    staff,
    blockEvents,
    packages,
    membershipPlans,
    clientMemberships,
    notificationSettings,
    notificationEvents,
    reportSchedule,
    schedulingSettings,
    classSessions,
    integrationConnections,
    apiTokens,
    webhookEndpoints,
    webhookDeliveries,
    businessProfile,
    businessName,
    publicBookingUrl,
    needsOnboarding,
    refresh,
    signIn,
    signUp,
    completeOnboarding,
    signInWithGoogle,
    resetPassword,
    changePassword,
    signOut,
    addClient,
    updateClient,
    deleteClient,
    mergeClients,
    addPayment,
    updatePaymentStatus,
    retryPayment,
    addAppointment,
    updateAppointmentStatus,
    bulkUpdateAppointmentStatus,
    updateAppointment,
    updateAppointmentFinalAmount,
    collectPayment,
    deleteAppointment,
    addService,
    updateService,
    deleteService,
    duplicateService,
    toggleService,
    addCategory,
    updateCategory,
    deleteCategory,
    saveStaffMember,
    deleteStaffMember,
    addBlockTime,
    deleteBlockTime,
    addPackage,
    deletePackage,
    addMembershipPlan,
    deleteMembershipPlan,
    enrollClientMembership,
    saveNotificationSettings,
    retryNotificationEvent,
    saveReportSchedule,
    saveSchedulingSettings,
    addClassSession,
    deleteClassSession,
    toggleIntegrationConnection,
    rotateCalendarFeedToken,
    issueApiToken,
    revokeApiToken,
    saveWebhookEndpoint,
    deleteWebhookEndpoint,
    saveBusinessProfile,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
