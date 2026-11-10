import { supabase } from "@/lib/supabase"

export type AdminRole = "super_admin" | "admin" | "support" | "viewer"

export type AdminContext = {
  is_admin: boolean
  admin_id: string | null
  role: AdminRole | null
  email: string | null
  user_id: string | null
}

export type AdminOverviewStats = {
  total_businesses: number
  total_auth_users: number
  free_count: number
  starter_count: number
  pro_count: number
  other_plan_count: number
  active_subscriptions: number
  suspended_users: number
  total_appointments: number
  total_paid_revenue_php: number
  audit_events_24h: number
  security_warnings_7d: number
}

export type AdminClientRow = {
  user_id: string
  email: string
  phone: string
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  created_at: string
  last_sign_in_at: string | null
  banned_until: string | null
  is_suspended: boolean
  has_password: boolean
  auth_providers: string[]
  account_type: string
  full_name: string
  mfa_enabled: boolean
  mfa_factors_count: number
  password_updated_at: string | null
  has_business_profile: boolean
  business_name: string
  slug: string
  industry: string
  business_email: string
  country_code: string
  business_phone: string
  city: string
  country: string
  brand_color: string
  theme: string
  logo_url: string
  website: string
  instagram: string
  facebook: string
  profile_updated_at: string | null
  plan_code: string
  plan_name: string
  monthly_price_php: number
  subscription_status: string
  billing_provider: string
  billing_cycle: string
  current_period_start: string | null
  current_period_end: string | null
  xendit_customer_id: string | null
  xendit_subscription_id: string | null
  subscription_notes: string
  subscription_updated_at: string | null
  services_count: number
  appointments_count: number
  clients_count: number
  staff_count: number
  paid_revenue_php: number
  total_count: number
}

export type AdminClientDetail = {
  credentials: {
    user_id: string
    email: string | null
    phone: string | null
    email_confirmed_at: string | null
    phone_confirmed_at: string | null
    has_password: boolean
    password_updated_at: string | null
    created_at: string
    updated_at: string | null
    last_sign_in_at: string | null
    banned_until: string | null
    is_suspended: boolean
    is_anonymous: boolean
    raw_user_meta_data: Record<string, unknown>
    raw_app_meta_data: Record<string, unknown>
    identities: Array<{
      id: string
      provider: string
      last_sign_in_at: string | null
      created_at: string | null
      identity_email: string | null
    }>
    mfa_factors: Array<{
      id: string
      friendly_name: string | null
      factor_type: string
      status: string
      created_at: string
    }>
  }
  business_profile: Record<string, unknown> | null
  subscription: {
    plan_code: string
    plan_name: string
    monthly_price_php: number
    status: string
    billing_provider: string
    billing_cycle: string
    amount_php: number
    currency: string
    current_period_start: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    cancel_at_period_end: boolean
    xendit_customer_id: string | null
    xendit_subscription_id: string | null
    xendit_latest_invoice_id: string | null
    xendit_latest_invoice_url: string | null
    xendit_payment_status: string | null
    notes: string
    updated_at: string | null
  }
  stats: {
    services_count: number
    appointments_count: number
    clients_count: number
    staff_count: number
    paid_revenue_php: number
    last_appointment_at: string | null
  }
  recent_audit_logs: AdminAuditLogRow[]
  recent_security_logs: Array<{
    id: string
    action: string
    details: string | null
    ip_address: string | null
    user_agent: string | null
    created_at: string
  }>
  checkout_sessions: Array<{
    id: string
    target_plan_code: string
    billing_cycle: string
    provider: string
    external_id: string
    xendit_invoice_id: string | null
    xendit_invoice_url: string | null
    amount_php: number
    currency: string
    status: string
    paid_at: string | null
    created_at: string
  }>
}

export type AdminAuditLogRow = {
  id: string
  actor_user_id?: string | null
  actor_email: string
  actor_role: string
  category: string
  action: string
  severity: "info" | "warning" | "critical"
  target_user_id?: string | null
  target_business_id?: string | null
  target_email?: string
  summary: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
  total_count?: number
}

export type UserSecurityLogRow = {
  id: string
  user_id: string
  user_email: string
  business_name: string
  action: string
  details: string
  ip_address: string
  user_agent: string
  created_at: string
  total_count: number
}

export type SubscriptionPlanRow = {
  code: string
  name: string
  description: string
  monthly_price_php: number
  annual_price_php: number
  currency: string
  max_staff: number | null
  max_locations: number | null
  features: string[]
  xendit_plan_id: string | null
  is_active: boolean
  is_public: boolean
  sort_order: number
}

export type PlatformAdminRow = {
  id: string
  user_id: string | null
  email: string
  role: AdminRole
  is_active: boolean
  notes: string
  created_at: string
  updated_at: string
}

export type OwnerSubscriptionInfo = {
  business_id: string
  plan_code: string
  plan_name: string
  plan_description: string
  monthly_price_php: number
  annual_price_php: number
  status: string
  billing_provider: string
  billing_cycle: string
  amount_php: number
  currency: string
  current_period_start: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  cancel_at_period_end: boolean
  xendit_latest_invoice_url: string | null
  xendit_payment_status: string | null
  features: string[]
}

export async function fetchAdminContext(): Promise<AdminContext> {
  if (!supabase) {
    return { is_admin: false, admin_id: null, role: null, email: null, user_id: null }
  }
  const { data, error } = await supabase.rpc("admin_get_context")
  if (error) {
    return { is_admin: false, admin_id: null, role: null, email: null, user_id: null }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || !row.is_admin) {
    return { is_admin: false, admin_id: null, role: null, email: null, user_id: row?.user_id ?? null }
  }
  return {
    is_admin: true,
    admin_id: row.admin_id ? String(row.admin_id) : null,
    role: (row.role as AdminRole) ?? "admin",
    email: row.email ? String(row.email) : null,
    user_id: row.user_id ? String(row.user_id) : null,
  }
}

export async function fetchAdminOverviewStats(): Promise<AdminOverviewStats> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_get_overview_stats")
  if (error) throw new Error(error.message)
  return data as AdminOverviewStats
}

export async function fetchAdminClients(params: {
  search?: string
  plan?: string
  status?: string
  accountType?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdminClientRow[]; totalCount: number }> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_list_clients", {
    p_search: params.search ?? "",
    p_plan: params.plan ?? "all",
    p_status: params.status ?? "all",
    p_account_type: params.accountType ?? "business",
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  })
  if (error) throw new Error(error.message)
  const rows = ((data as AdminClientRow[]) ?? []).map((row) => ({
    ...row,
    monthly_price_php: Number(row.monthly_price_php ?? 0),
    services_count: Number(row.services_count ?? 0),
    appointments_count: Number(row.appointments_count ?? 0),
    clients_count: Number(row.clients_count ?? 0),
    staff_count: Number(row.staff_count ?? 0),
    paid_revenue_php: Number(row.paid_revenue_php ?? 0),
    total_count: Number(row.total_count ?? 0),
    auth_providers: Array.isArray(row.auth_providers) ? row.auth_providers : [],
  }))
  return {
    rows,
    totalCount: rows[0]?.total_count ?? 0,
  }
}

export async function fetchAdminClientDetail(userId: string, logView = true): Promise<AdminClientDetail> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_get_client_detail", {
    p_user_id: userId,
    p_log_view: logView,
  })
  if (error) throw new Error(error.message)
  return data as AdminClientDetail
}

export async function updateClientSubscription(params: {
  businessId: string
  planCode: string
  status: string
  billingProvider: string
  billingCycle: string
  periodEnd: string | null
  notes: string
}) {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_update_client_subscription", {
    p_business_id: params.businessId,
    p_plan_code: params.planCode,
    p_status: params.status,
    p_billing_provider: params.billingProvider,
    p_billing_cycle: params.billingCycle,
    p_period_end: params.periodEnd || null,
    p_notes: params.notes,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function toggleUserSuspension(userId: string, suspend: boolean, reason: string) {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_toggle_user_suspension", {
    p_user_id: userId,
    p_suspend: suspend,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function recordAdminAuditEvent(params: {
  action: string
  category?: string
  severity?: "info" | "warning" | "critical"
  targetUserId?: string | null
  targetBusinessId?: string | null
  targetEmail?: string
  summary: string
  metadata?: Record<string, unknown>
}) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("admin_record_audit_event", {
    p_action: params.action,
    p_category: params.category ?? "admin",
    p_severity: params.severity ?? "info",
    p_target_user_id: params.targetUserId ?? null,
    p_target_business_id: params.targetBusinessId ?? null,
    p_target_email: params.targetEmail ?? "",
    p_summary: params.summary,
    p_metadata: params.metadata ?? {},
  })
  if (error) return null
  return data
}

export async function fetchAdminAuditLogs(params: {
  search?: string
  category?: string
  severity?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdminAuditLogRow[]; totalCount: number }> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_list_audit_logs", {
    p_search: params.search ?? "",
    p_category: params.category ?? "all",
    p_severity: params.severity ?? "all",
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  })
  if (error) throw new Error(error.message)
  const rows = ((data as AdminAuditLogRow[]) ?? []).map((row) => ({
    ...row,
    total_count: Number(row.total_count ?? 0),
  }))
  return {
    rows,
    totalCount: rows[0]?.total_count ?? 0,
  }
}

export async function fetchUserSecurityLogs(params: {
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: UserSecurityLogRow[]; totalCount: number }> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_list_user_security_logs", {
    p_search: params.search ?? "",
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  })
  if (error) throw new Error(error.message)
  const rows = ((data as UserSecurityLogRow[]) ?? []).map((row) => ({
    ...row,
    total_count: Number(row.total_count ?? 0),
  }))
  return {
    rows,
    totalCount: rows[0]?.total_count ?? 0,
  }
}

export async function fetchSubscriptionPlans(includeInactive = false): Promise<SubscriptionPlanRow[]> {
  if (!supabase) return []
  let query = supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true })
  if (!includeInactive) {
    query = query.eq("is_active", true)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    code: String(row.code),
    name: String(row.name),
    description: String(row.description ?? ""),
    monthly_price_php: Number(row.monthly_price_php ?? 0),
    annual_price_php: Number(row.annual_price_php ?? 0),
    currency: String(row.currency ?? "PHP"),
    max_staff: row.max_staff === null || row.max_staff === undefined ? null : Number(row.max_staff),
    max_locations: row.max_locations === null || row.max_locations === undefined ? null : Number(row.max_locations),
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    xendit_plan_id: row.xendit_plan_id ? String(row.xendit_plan_id) : null,
    is_active: Boolean(row.is_active),
    is_public: Boolean(row.is_public),
    sort_order: Number(row.sort_order ?? 0),
  }))
}

export async function upsertSubscriptionPlan(plan: {
  code: string
  name: string
  description: string
  monthly_price_php: number
  annual_price_php: number
  max_staff: number | null
  max_locations: number | null
  features: string[]
  xendit_plan_id: string | null
  is_active: boolean
  is_public: boolean
  sort_order: number
}) {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_upsert_subscription_plan", {
    p_code: plan.code,
    p_name: plan.name,
    p_description: plan.description,
    p_monthly_price_php: plan.monthly_price_php,
    p_annual_price_php: plan.annual_price_php,
    p_max_staff: plan.max_staff,
    p_max_locations: plan.max_locations,
    p_features: plan.features,
    p_xendit_plan_id: plan.xendit_plan_id,
    p_is_active: plan.is_active,
    p_is_public: plan.is_public,
    p_sort_order: plan.sort_order,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function fetchPlatformAdmins(): Promise<PlatformAdminRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_list_platform_admins")
  if (error) throw new Error(error.message)
  return (data as PlatformAdminRow[]) ?? []
}

export async function upsertPlatformAdmin(params: {
  email: string
  role: AdminRole
  isActive: boolean
  notes: string
}) {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase.rpc("admin_upsert_platform_admin", {
    p_email: params.email,
    p_role: params.role,
    p_is_active: params.isActive,
    p_notes: params.notes,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function fetchMySubscription(): Promise<OwnerSubscriptionInfo | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_my_subscription")
  if (error) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    business_id: String(row.business_id),
    plan_code: String(row.plan_code ?? "starter"),
    plan_name: String(row.plan_name ?? "Starter"),
    plan_description: String(row.plan_description ?? ""),
    monthly_price_php: Number(row.monthly_price_php ?? 249),
    annual_price_php: Number(row.annual_price_php ?? 2490),
    status: String(row.status ?? "active"),
    billing_provider: String(row.billing_provider ?? "manual"),
    billing_cycle: String(row.billing_cycle ?? "monthly"),
    amount_php: Number(row.amount_php ?? 249),
    currency: String(row.currency ?? "PHP"),
    current_period_start: row.current_period_start ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    trial_ends_at: row.trial_ends_at ? String(row.trial_ends_at) : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    xendit_latest_invoice_url: row.xendit_latest_invoice_url ? String(row.xendit_latest_invoice_url) : null,
    xendit_payment_status: row.xendit_payment_status ? String(row.xendit_payment_status) : null,
    features: Array.isArray(row.features) ? row.features.map(String) : [],
  }
}

