import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCheck,
  UserX,
  Users,
  XCircle,
} from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { OwnerMobileMenuButton } from "@/components/owner/OwnerSidebar"
import {
  OwnerDataTable,
  OwnerDrawer,
  OwnerFilterBar,
  OwnerPagination,
  OwnerStatusBadge,
  type OwnerStatusTone,
  type OwnerTableColumn,
} from "@/components/owner/OwnerDataPrimitives"
import { Button } from "@/components/ui/button"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import {
  fetchAdminAuditLogs,
  fetchAdminClientDetail,
  fetchAdminClients,
  fetchAdminOverviewStats,
  fetchPlatformAdmins,
  fetchSubscriptionPlans,
  fetchUserSecurityLogs,
  recordAdminAuditEvent,
  toggleUserSuspension,
  updateClientSubscription,
  upsertPlatformAdmin,
  upsertSubscriptionPlan,
  type AdminAuditLogRow,
  type AdminClientDetail,
  type AdminClientRow,
  type AdminContext,
  type AdminOverviewStats,
  type AdminRole,
  type PlatformAdminRow,
  type SubscriptionPlanRow,
  type UserSecurityLogRow,
} from "@/lib/admin"

type AdminTab = "overview" | "clients" | "subscriptions" | "audit" | "admins"
type ClientDrawerTab = "credentials" | "profile" | "subscription" | "logs"

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed)
}

const formatCurrency = (amount: number | null | undefined) =>
  `₱${Number(amount ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`

const planTone = (planCode: string): OwnerStatusTone => {
  switch (planCode) {
    case "pro":
      return "success"
    case "enterprise":
      return "info"
    case "starter":
      return "warning"
    default:
      return "neutral"
  }
}

const subStatusTone = (status: string, isSuspended = false): OwnerStatusTone => {
  if (isSuspended) return "danger"
  switch (status) {
    case "active":
      return "success"
    case "trialing":
      return "info"
    case "past_due":
      return "warning"
    case "cancelled":
    case "expired":
      return "danger"
    default:
      return "neutral"
  }
}

const severityTone = (severity: string): OwnerStatusTone => {
  if (severity === "critical") return "danger"
  if (severity === "warning") return "warning"
  return "info"
}

const csvCell = (value: unknown) => {
  const raw = String(value ?? "")
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<unknown>>) => {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function AdminDashboardPage({
  user,
  adminContext,
  onSignOut,
  onSwitchToOwner,
}: {
  user: User
  adminContext: AdminContext
  onSignOut: () => void
  onSwitchToOwner?: () => void
}) {
  const [tab, setTab] = useState<AdminTab>("overview")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Overview state
  const [stats, setStats] = useState<AdminOverviewStats | null>(null)
  const [overviewLogs, setOverviewLogs] = useState<AdminAuditLogRow[]>([])
  const [overviewLoading, setOverviewLoading] = useState(true)

  // Plans catalog
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([])

  // Clients directory state
  const [clients, setClients] = useState<AdminClientRow[]>([])
  const [clientsTotal, setClientsTotal] = useState(0)
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState("")
  const [clientPlanFilter, setClientPlanFilter] = useState("all")
  const [clientStatusFilter, setClientStatusFilter] = useState("all")
  const [clientAccountType, setClientAccountType] = useState("business")
  const [clientPage, setClientPage] = useState(1)
  const clientsPageSize = 20

  // Client detail drawer state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientDetail, setClientDetail] = useState<AdminClientDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawerTab, setDrawerTab] = useState<ClientDrawerTab>("credentials")

  // Subscription edit form inside drawer
  const [editPlanCode, setEditPlanCode] = useState("starter")
  const [editSubStatus, setEditSubStatus] = useState("active")
  const [editProvider, setEditProvider] = useState("manual")
  const [editCycle, setEditCycle] = useState("monthly")
  const [editPeriodEnd, setEditPeriodEnd] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [savingSub, setSavingSub] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [suspendReason, setSuspendReason] = useState("")
  const [sendingReset, setSendingReset] = useState(false)

  // Audit logs state
  const [auditView, setAuditView] = useState<"admin" | "security">("admin")
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [securityLogs, setSecurityLogs] = useState<UserSecurityLogRow[]>([])
  const [securityTotal, setSecurityTotal] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditSearch, setAuditSearch] = useState("")
  const [auditCategory, setAuditCategory] = useState("all")
  const [auditSeverity, setAuditSeverity] = useState("all")
  const [auditPage, setAuditPage] = useState(1)
  const [inspectedLog, setInspectedLog] = useState<AdminAuditLogRow | null>(null)
  const auditPageSize = 25

  // Plan editor state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanRow | null>(null)
  const [planFeaturesText, setPlanFeaturesText] = useState("")
  const [savingPlan, setSavingPlan] = useState(false)

  // Platform admins state
  const [platformAdmins, setPlatformAdmins] = useState<PlatformAdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>("admin")
  const [newAdminNotes, setNewAdminNotes] = useState("")
  const [savingAdmin, setSavingAdmin] = useState(false)

  const canMutate = adminContext.role === "super_admin" || adminContext.role === "admin"
  const isSuperAdmin = adminContext.role === "super_admin"

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const [nextStats, recentLogs, planRows] = await Promise.all([
        fetchAdminOverviewStats(),
        fetchAdminAuditLogs({ limit: 8, offset: 0 }),
        fetchSubscriptionPlans(true),
      ])
      setStats(nextStats)
      setOverviewLogs(recentLogs.rows)
      setPlans(planRows)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load admin overview.", "error")
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadClients = useCallback(async () => {
    setClientsLoading(true)
    try {
      const { rows, totalCount } = await fetchAdminClients({
        search: clientSearch,
        plan: clientPlanFilter,
        status: clientStatusFilter,
        accountType: clientAccountType,
        limit: clientsPageSize,
        offset: (clientPage - 1) * clientsPageSize,
      })
      setClients(rows)
      setClientsTotal(totalCount)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load clients.", "error")
    } finally {
      setClientsLoading(false)
    }
  }, [clientAccountType, clientPage, clientPlanFilter, clientSearch, clientStatusFilter])

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      if (auditView === "admin") {
        const { rows, totalCount } = await fetchAdminAuditLogs({
          search: auditSearch,
          category: auditCategory,
          severity: auditSeverity,
          limit: auditPageSize,
          offset: (auditPage - 1) * auditPageSize,
        })
        setAuditLogs(rows)
        setAuditTotal(totalCount)
      } else {
        const { rows, totalCount } = await fetchUserSecurityLogs({
          search: auditSearch,
          limit: auditPageSize,
          offset: (auditPage - 1) * auditPageSize,
        })
        setSecurityLogs(rows)
        setSecurityTotal(totalCount)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load audit logs.", "error")
    } finally {
      setAuditLoading(false)
    }
  }, [auditCategory, auditPage, auditSearch, auditSeverity, auditView])

  const loadPlatformAdmins = useCallback(async () => {
    setAdminsLoading(true)
    try {
      const rows = await fetchPlatformAdmins()
      setPlatformAdmins(rows)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load admin list.", "error")
    } finally {
      setAdminsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (tab === "clients") void loadClients()
  }, [loadClients, tab])

  useEffect(() => {
    if (tab === "audit") void loadAuditLogs()
  }, [loadAuditLogs, tab])

  useEffect(() => {
    if (tab === "admins") void loadPlatformAdmins()
  }, [loadPlatformAdmins, tab])

  const openClientInspector = async (userId: string, initialTab: ClientDrawerTab = "credentials") => {
    setSelectedClientId(userId)
    setDrawerTab(initialTab)
    setDetailLoading(true)
    setSuspendReason("")
    try {
      const detail = await fetchAdminClientDetail(userId, true)
      setClientDetail(detail)
      setEditPlanCode(detail.subscription.plan_code || "starter")
      setEditSubStatus(detail.subscription.status || "active")
      setEditProvider(detail.subscription.billing_provider || "manual")
      setEditCycle(detail.subscription.billing_cycle || "monthly")
      setEditPeriodEnd(detail.subscription.current_period_end ? detail.subscription.current_period_end.slice(0, 10) : "")
      setEditNotes(detail.subscription.notes || "")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load client details.", "error")
      setSelectedClientId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshSelectedClient = async () => {
    if (!selectedClientId) return
    const detail = await fetchAdminClientDetail(selectedClientId, false)
    setClientDetail(detail)
  }

  const handleSaveSubscription = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedClientId || !canMutate) return
    setSavingSub(true)
    try {
      await updateClientSubscription({
        businessId: selectedClientId,
        planCode: editPlanCode,
        status: editSubStatus,
        billingProvider: editProvider,
        billingCycle: editCycle,
        periodEnd: editPeriodEnd ? new Date(`${editPeriodEnd}T23:59:59Z`).toISOString() : null,
        notes: editNotes,
      })
      showToast("Client subscription updated & logged.")
      await Promise.all([refreshSelectedClient(), loadClients(), loadOverview()])
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update subscription.", "error")
    } finally {
      setSavingSub(false)
    }
  }

  const handleToggleSuspension = async () => {
    if (!selectedClientId || !clientDetail || !canMutate) return
    const nextSuspend = !clientDetail.credentials.is_suspended
    setSuspending(true)
    try {
      await toggleUserSuspension(selectedClientId, nextSuspend, suspendReason)
      showToast(nextSuspend ? "Client account suspended." : "Client account restored.")
      setSuspendReason("")
      await Promise.all([refreshSelectedClient(), loadClients(), loadOverview()])
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update suspension status.", "error")
    } finally {
      setSuspending(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!supabase || !clientDetail?.credentials.email) return
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clientDetail.credentials.email, {
        redirectTo: `${window.location.origin}/settings`,
      })
      if (error) throw new Error(error.message)
      await recordAdminAuditEvent({
        action: "admin.password_reset_sent",
        category: "auth",
        severity: "warning",
        targetUserId: clientDetail.credentials.user_id,
        targetBusinessId: clientDetail.credentials.user_id,
        targetEmail: clientDetail.credentials.email,
        summary: `Triggered password reset email for ${clientDetail.credentials.email}`,
      })
      showToast(`Password reset email sent to ${clientDetail.credentials.email}`)
      await refreshSelectedClient()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send password reset email.", "error")
    } finally {
      setSendingReset(false)
    }
  }

  const handleCopyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`${label} copied`)
    } catch {
      showToast(`Could not copy ${label}`, "error")
    }
  }

  const handleExportClients = async () => {
    downloadCsv(
      `bookora-clients-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "User ID",
        "Account Type",
        "Business Name",
        "Slug",
        "Owner Email",
        "Email Verified",
        "Phone",
        "Auth Providers",
        "MFA Enabled",
        "Suspended",
        "Plan",
        "Subscription Status",
        "Billing Provider",
        "Services",
        "Appointments",
        "Clients",
        "Staff",
        "Paid Revenue PHP",
        "Last Sign In",
        "Joined",
      ],
      clients.map((c) => [
        c.user_id,
        c.account_type,
        c.business_name,
        c.slug,
        c.email,
        c.email_confirmed_at ? "Yes" : "No",
        `${c.country_code} ${c.business_phone || c.phone}`.trim(),
        c.auth_providers.join(" | "),
        c.mfa_enabled ? "Yes" : "No",
        c.is_suspended ? "Yes" : "No",
        c.plan_code,
        c.subscription_status,
        c.billing_provider,
        c.services_count,
        c.appointments_count,
        c.clients_count,
        c.staff_count,
        c.paid_revenue_php,
        c.last_sign_in_at || "",
        c.created_at,
      ])
    )
    await recordAdminAuditEvent({
      action: "admin.clients_exported",
      category: "admin",
      severity: "info",
      summary: `Exported ${clients.length} Bookora client rows to CSV`,
      metadata: { plan_filter: clientPlanFilter, status_filter: clientStatusFilter, account_type: clientAccountType },
    })
    showToast("Client list exported to CSV")
  }

  const handleExportAuditLogs = async () => {
    downloadCsv(
      `bookora-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Timestamp", "Actor Email", "Actor Role", "Category", "Action", "Severity", "Target Email", "Summary"],
      auditLogs.map((l) => [
        l.created_at,
        l.actor_email,
        l.actor_role,
        l.category,
        l.action,
        l.severity,
        l.target_email || "",
        l.summary,
      ])
    )
    await recordAdminAuditEvent({
      action: "admin.audit_logs_exported",
      category: "security",
      severity: "info",
      summary: `Exported ${auditLogs.length} audit log records to CSV`,
    })
    showToast("Audit logs exported to CSV")
  }

  const handleSavePlan = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingPlan || !canMutate) return
    setSavingPlan(true)
    try {
      const features = planFeaturesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      await upsertSubscriptionPlan({
        ...editingPlan,
        features,
      })
      showToast(`Plan "${editingPlan.name}" saved.`)
      setEditingPlan(null)
      const fresh = await fetchSubscriptionPlans(true)
      setPlans(fresh)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save plan.", "error")
    } finally {
      setSavingPlan(false)
    }
  }

  const handleSavePlatformAdmin = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSuperAdmin || !newAdminEmail.trim()) return
    setSavingAdmin(true)
    try {
      await upsertPlatformAdmin({
        email: newAdminEmail.trim(),
        role: newAdminRole,
        isActive: true,
        notes: newAdminNotes.trim(),
      })
      showToast(`Admin access saved for ${newAdminEmail.trim()}`)
      setNewAdminEmail("")
      setNewAdminNotes("")
      await loadPlatformAdmins()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add admin.", "error")
    } finally {
      setSavingAdmin(false)
    }
  }

  const handleToggleAdminActive = async (row: PlatformAdminRow) => {
    if (!isSuperAdmin) return
    if (row.user_id === user.id) {
      showToast("You cannot deactivate your own active super-admin session.", "error")
      return
    }
    try {
      await upsertPlatformAdmin({
        email: row.email,
        role: row.role,
        isActive: !row.is_active,
        notes: row.notes,
      })
      showToast(`${row.email} ${row.is_active ? "deactivated" : "reactivated"}.`)
      await loadPlatformAdmins()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update admin status.", "error")
    }
  }

  const clientColumns: OwnerTableColumn<AdminClientRow>[] = useMemo(
    () => [
      {
        key: "business",
        label: "Client / Business",
        render: (row) => (
          <div className="admin-cell-stack">
            <strong>{row.business_name || row.full_name || "No business profile"}</strong>
            <small>
              {row.slug ? `/${row.slug}` : row.account_type}
              {row.industry ? ` · ${row.industry}` : ""}
              {row.city ? ` · ${row.city}` : ""}
            </small>
          </div>
        ),
      },
      {
        key: "credentials",
        label: "Credentials & Auth",
        render: (row) => (
          <div className="admin-cell-stack">
            <span>{row.email || "—"}</span>
            <div className="admin-inline-badges">
              <OwnerStatusBadge
                label={row.email_confirmed_at ? "Verified" : "Unverified"}
                tone={row.email_confirmed_at ? "success" : "warning"}
              />
              <OwnerStatusBadge
                label={row.auth_providers.join(", ") || "email"}
                tone="neutral"
              />
              {row.mfa_enabled && <OwnerStatusBadge label="2FA" tone="info" />}
              {row.is_suspended && <OwnerStatusBadge label="Suspended" tone="danger" />}
            </div>
          </div>
        ),
      },
      {
        key: "subscription",
        label: "Subscription",
        render: (row) => (
          <div className="admin-cell-stack">
            <div className="admin-inline-badges">
              <OwnerStatusBadge label={row.plan_name || row.plan_code} tone={planTone(row.plan_code)} />
              <OwnerStatusBadge
                label={row.is_suspended ? "suspended" : row.subscription_status}
                tone={subStatusTone(row.subscription_status, row.is_suspended)}
              />
            </div>
            <small>
              {formatCurrency(row.monthly_price_php)}/mo · {row.billing_provider}
            </small>
          </div>
        ),
      },
      {
        key: "usage",
        label: "Usage",
        render: (row) => (
          <div className="admin-cell-stack">
            <span>
              {row.appointments_count} appts · {row.clients_count} clients
            </span>
            <small>
              {row.services_count} services · {formatCurrency(row.paid_revenue_php)}
            </small>
          </div>
        ),
      },
      {
        key: "activity",
        label: "Last Sign-In",
        render: (row) => (
          <div className="admin-cell-stack">
            <span>{formatDateTime(row.last_sign_in_at)}</span>
            <small>Joined {formatDateTime(row.created_at)}</small>
          </div>
        ),
      },
      {
        key: "actions",
        label: "",
        render: (row) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openClientInspector(row.user_id, "credentials")}
          >
            <Eye data-icon="inline-start" />
            Inspect
          </Button>
        ),
      },
    ],
    []
  )

  const auditColumns: OwnerTableColumn<AdminAuditLogRow>[] = useMemo(
    () => [
      {
        key: "time",
        label: "Timestamp",
        render: (row) => <span className="admin-mono-sm">{formatDateTime(row.created_at)}</span>,
      },
      {
        key: "actor",
        label: "Actor",
        render: (row) => (
          <div className="admin-cell-stack">
            <strong>{row.actor_email || "system"}</strong>
            <small>{row.actor_role}</small>
          </div>
        ),
      },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <div className="admin-cell-stack">
            <code className="admin-code-pill">{row.action}</code>
            <small>{row.category}</small>
          </div>
        ),
      },
      {
        key: "severity",
        label: "Severity",
        render: (row) => <OwnerStatusBadge label={row.severity} tone={severityTone(row.severity)} />,
      },
      {
        key: "summary",
        label: "Summary & Target",
        render: (row) => (
          <div className="admin-cell-stack">
            <span>{row.summary}</span>
            {row.target_email && <small>Target: {row.target_email}</small>}
          </div>
        ),
      },
      {
        key: "inspect",
        label: "",
        render: (row) => (
          <Button type="button" variant="outline" size="sm" onClick={() => setInspectedLog(row)}>
            Details
          </Button>
        ),
      },
    ],
    []
  )

  const securityColumns: OwnerTableColumn<UserSecurityLogRow>[] = useMemo(
    () => [
      {
        key: "time",
        label: "Timestamp",
        render: (row) => <span className="admin-mono-sm">{formatDateTime(row.created_at)}</span>,
      },
      {
        key: "user",
        label: "Account",
        render: (row) => (
          <div className="admin-cell-stack">
            <strong>{row.user_email || row.user_id}</strong>
            <small>{row.business_name || "—"}</small>
          </div>
        ),
      },
      {
        key: "action",
        label: "Event",
        render: (row) => <code className="admin-code-pill">{row.action}</code>,
      },
      {
        key: "details",
        label: "Details",
        render: (row) => <span>{row.details || "—"}</span>,
      },
    ],
    []
  )

  const navItems: Array<{ key: AdminTab; label: string; icon: typeof Activity }> = [
    { key: "overview", label: "Overview", icon: Activity },
    { key: "clients", label: "Bookora Clients", icon: Building2 },
    { key: "subscriptions", label: "Plans & Xendit", icon: CreditCard },
    { key: "audit", label: "Audit Logs", icon: ShieldAlert },
    { key: "admins", label: "Admin Access", icon: ShieldCheck },
  ]

  const clientPageCount = Math.max(1, Math.ceil(clientsTotal / clientsPageSize))
  const auditPageCount = Math.max(
    1,
    Math.ceil((auditView === "admin" ? auditTotal : securityTotal) / auditPageSize)
  )

  const totalBusinesses = stats?.total_businesses || 0
  const planDistribution = [
    { label: "Free", code: "free", count: stats?.free_count || 0, tone: "neutral" as const },
    { label: "Starter", code: "starter", count: stats?.starter_count || 0, tone: "warning" as const },
    { label: "Pro", code: "pro", count: stats?.pro_count || 0, tone: "success" as const },
    { label: "Other", code: "other", count: stats?.other_plan_count || 0, tone: "info" as const },
  ]

  const sqlAdminSnippet = `-- Run in Supabase SQL Editor to grant admin access
insert into public.platform_admins (email, role, notes)
values ('your-email@bookoraph.com', 'super_admin', 'Founder / Platform Admin')
on conflict (lower(email)) do update
set role = excluded.role, is_active = true;`

  const webhookUrlPreview = `${import.meta.env.VITE_SUPABASE_URL || "https://<project-ref>.supabase.co"}/functions/v1/xendit-webhook`

  return (
    <div className="dashboard-shell">
      {sidebarOpen && (
        <button className="dashboard-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="dashboard-brand">
          <Logo />
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">
            <Shield />
          </span>
          <span>
            <strong>Platform Admin</strong>
            <small>{adminContext.role || "admin"} · Bookora PH</small>
          </span>
        </div>
        <nav className="dashboard-nav" aria-label="Admin console">
          <p className="dashboard-nav-label">Control Plane</p>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                className={tab === item.key ? "active" : ""}
                aria-current={tab === item.key ? "page" : undefined}
                onClick={() => {
                  setTab(item.key)
                  setSidebarOpen(false)
                }}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <div className="help-card">
            <strong>Signed in as</strong>
            <span>{adminContext.email || user.email}</span>
            {onSwitchToOwner && (
              <button type="button" onClick={onSwitchToOwner}>
                Open Owner Workspace <ArrowUpRight />
              </button>
            )}
            <button type="button" onClick={onSignOut}>
              <LogOut /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-header">
          <OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} />
          <div className="dashboard-search">
            <Search />
            <input
              aria-label="Quick search clients"
              placeholder="Search Bookora clients by business, email, slug, or ID…"
              value={clientSearch}
              onChange={(event) => {
                setClientSearch(event.target.value)
                setClientPage(1)
                if (tab !== "clients") setTab("clients")
              }}
            />
          </div>
          <div className="dashboard-header-actions">
            <OwnerStatusBadge label={`Role: ${adminContext.role || "admin"}`} tone="info" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void loadOverview()
                if (tab === "clients") void loadClients()
                if (tab === "audit") void loadAuditLogs()
                if (tab === "admins") void loadPlatformAdmins()
              }}
            >
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </header>

        <main className="dashboard-main">
          {tab === "overview" && (
            <div className="admin-section">
              <div className="dashboard-page-heading">
                <div>
                  <p className="dashboard-kicker">Bookora PH Control Center</p>
                  <h1>Platform Admin Overview</h1>
                  <p>
                    Monitor registered businesses, inspect account credentials & profiles, manage Free / Starter / Pro subscriptions, and review security audit logs.
                  </p>
                </div>
                <Button type="button" onClick={() => setTab("clients")}>
                  <Users data-icon="inline-start" />
                  Browse all clients
                </Button>
              </div>

              <section className="admin-kpi-grid">
                <article className="admin-kpi-card">
                  <span className="metric-icon coral">
                    <Store />
                  </span>
                  <div>
                    <small>Business Clients</small>
                    <strong>{overviewLoading ? "—" : stats?.total_businesses ?? 0}</strong>
                    <em>{stats?.total_auth_users ?? 0} total auth accounts</em>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="metric-icon lavender">
                    <CreditCard />
                  </span>
                  <div>
                    <small>Active Subscriptions</small>
                    <strong>{overviewLoading ? "—" : stats?.active_subscriptions ?? 0}</strong>
                    <em>Starter default applied to existing clients</em>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="metric-icon mint">
                    <Layers />
                  </span>
                  <div>
                    <small>Platform Bookings & Paid</small>
                    <strong>{overviewLoading ? "—" : stats?.total_appointments ?? 0}</strong>
                    <em>{formatCurrency(stats?.total_paid_revenue_php)} recorded paid</em>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="metric-icon peach">
                    <ShieldAlert />
                  </span>
                  <div>
                    <small>Audit Events (24h)</small>
                    <strong>{overviewLoading ? "—" : stats?.audit_events_24h ?? 0}</strong>
                    <em>
                      {stats?.security_warnings_7d ?? 0} warnings (7d) · {stats?.suspended_users ?? 0} suspended
                    </em>
                  </div>
                </article>
              </section>

              <section className="admin-two-col">
                <article className="admin-card">
                  <div className="panel-heading">
                    <div>
                      <h2>Subscription Tier Breakdown</h2>
                      <p>All existing businesses were initialized to Starter until Xendit paywall goes live.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setTab("subscriptions")}>
                      Manage plans
                    </Button>
                  </div>
                  <div className="admin-plan-bars">
                    {planDistribution.map((item) => {
                      const pct = totalBusinesses > 0 ? Math.round((item.count / totalBusinesses) * 100) : 0
                      return (
                        <div className="admin-plan-bar-row" key={item.code}>
                          <div className="admin-plan-bar-meta">
                            <OwnerStatusBadge label={item.label} tone={item.tone} />
                            <span>
                              <strong>{item.count}</strong> ({pct}%)
                            </span>
                          </div>
                          <div className="admin-progress-track">
                            <div className={`admin-progress-fill tone-${item.tone}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>

                <article className="admin-card">
                  <div className="panel-heading">
                    <div>
                      <h2>Xendit Paywall Readiness</h2>
                      <p>Schema, subscription tables, and Edge Functions are wired for Xendit upgrades.</p>
                    </div>
                    <OwnerStatusBadge label="Ready for API keys" tone="info" />
                  </div>
                  <ul className="admin-checklist">
                    <li>
                      <CheckCircle2 size={16} />
                      <span>
                        <code>subscription_plans</code> & <code>business_subscriptions</code> tables created
                      </span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} />
                      <span>
                        <code>subscription_checkout_sessions</code> idempotent invoice tracker ready
                      </span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} />
                      <span>
                        Edge Functions: <code>xendit-create-checkout</code> & <code>xendit-webhook</code>
                      </span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} />
                      <span>Owner Settings → Billing displays active plan & upgrade CTA</span>
                    </li>
                  </ul>
                </article>
              </section>

              <article className="admin-card">
                <div className="panel-heading">
                  <div>
                    <h2>Recent Security & Platform Audit Logs</h2>
                    <p>Immutable trail of admin actions, subscription updates, and password/security events.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTab("audit")}>
                    View full audit log
                  </Button>
                </div>
                {overviewLogs.length === 0 ? (
                  <p className="admin-muted">No audit events recorded yet.</p>
                ) : (
                  <div className="admin-feed">
                    {overviewLogs.map((log) => (
                      <div className="admin-feed-item" key={log.id}>
                        <div className="admin-feed-left">
                          <OwnerStatusBadge label={log.severity} tone={severityTone(log.severity)} />
                          <div>
                            <strong>{log.summary}</strong>
                            <small>
                              <code>{log.action}</code> · by {log.actor_email || "system"} ({log.actor_role})
                            </small>
                          </div>
                        </div>
                        <time>{formatDateTime(log.created_at)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )}

          {tab === "clients" && (
            <div className="admin-section">
              <div className="dashboard-page-heading">
                <div>
                  <p className="dashboard-kicker">Bookora SaaS Tenants</p>
                  <h1>Clients Directory</h1>
                  <p>
                    Inspect client credentials, auth providers, business profiles, usage metrics, and subscription tiers.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void handleExportClients()} disabled={!clients.length}>
                  <Download data-icon="inline-start" />
                  Export CSV
                </Button>
              </div>

              <OwnerFilterBar
                onClear={
                  clientSearch || clientPlanFilter !== "all" || clientStatusFilter !== "all" || clientAccountType !== "business"
                    ? () => {
                        setClientSearch("")
                        setClientPlanFilter("all")
                        setClientStatusFilter("all")
                        setClientAccountType("business")
                        setClientPage(1)
                      }
                    : undefined
                }
              >
                <input
                  className="admin-filter-input"
                  placeholder="Search business, email, slug, phone, city…"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    setClientPage(1)
                  }}
                />
                <select
                  className="admin-filter-select"
                  aria-label="Filter by account type"
                  value={clientAccountType}
                  onChange={(e) => {
                    setClientAccountType(e.target.value)
                    setClientPage(1)
                  }}
                >
                  <option value="business">Business Clients</option>
                  <option value="all">All Auth Users</option>
                  <option value="staff">Staff Accounts</option>
                  <option value="client">End Customers</option>
                </select>
                <select
                  className="admin-filter-select"
                  aria-label="Filter by plan"
                  value={clientPlanFilter}
                  onChange={(e) => {
                    setClientPlanFilter(e.target.value)
                    setClientPage(1)
                  }}
                >
                  <option value="all">All Plans</option>
                  {plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} ({formatCurrency(p.monthly_price_php)})
                    </option>
                  ))}
                </select>
                <select
                  className="admin-filter-select"
                  aria-label="Filter by subscription status"
                  value={clientStatusFilter}
                  onChange={(e) => {
                    setClientStatusFilter(e.target.value)
                    setClientPage(1)
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="past_due">Past Due</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended Users</option>
                </select>
              </OwnerFilterBar>

              <div className="admin-table-meta">
                <span>
                  Showing <strong>{clients.length}</strong> of <strong>{clientsTotal}</strong> matching accounts
                </span>
              </div>

              {clientsLoading ? (
                <div className="admin-card">Loading Bookora clients…</div>
              ) : (
                <OwnerDataTable
                  rows={clients.map((c) => ({ ...c, id: c.user_id }))}
                  columns={clientColumns}
                  empty={
                    <div className="admin-card">
                      <strong>No matching Bookora clients found</strong>
                      <p className="admin-muted">Try adjusting your search or filter selections.</p>
                    </div>
                  }
                />
              )}

              <OwnerPagination page={clientPage} pageCount={clientPageCount} onPageChange={setClientPage} />
            </div>
          )}

          {tab === "subscriptions" && (
            <div className="admin-section">
              <div className="dashboard-page-heading">
                <div>
                  <p className="dashboard-kicker">Pricing & Paywall</p>
                  <h1>Subscriptions & Xendit Integration</h1>
                  <p>
                    Configure Bookora subscription tiers (Free, Starter, Pro, and custom plans) and prepare your Xendit paywall.
                  </p>
                </div>
                {canMutate && (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingPlan({
                        code: "",
                        name: "",
                        description: "",
                        monthly_price_php: 0,
                        annual_price_php: 0,
                        currency: "PHP",
                        max_staff: null,
                        max_locations: 1,
                        features: [],
                        xendit_plan_id: null,
                        is_active: true,
                        is_public: true,
                        sort_order: plans.length + 1,
                      })
                      setPlanFeaturesText("")
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    Add Plan
                  </Button>
                )}
              </div>

              <div className="admin-plans-grid">
                {plans.map((plan) => (
                  <article className="admin-card admin-plan-card" key={plan.code}>
                    <div className="admin-plan-card-head">
                      <div>
                        <div className="admin-inline-badges">
                          <OwnerStatusBadge label={plan.code.toUpperCase()} tone={planTone(plan.code)} />
                          {!plan.is_active && <OwnerStatusBadge label="Inactive" tone="danger" />}
                          {!plan.is_public && <OwnerStatusBadge label="Hidden" tone="neutral" />}
                        </div>
                        <h3>{plan.name}</h3>
                        <p className="admin-muted">{plan.description}</p>
                      </div>
                      <div className="admin-plan-price">
                        <strong>{formatCurrency(plan.monthly_price_php)}</strong>
                        <small>/month · {formatCurrency(plan.annual_price_php)}/yr</small>
                      </div>
                    </div>

                    <div className="admin-plan-limits">
                      <span>Max Staff: {plan.max_staff ?? "Unlimited"}</span>
                      <span>Max Locations: {plan.max_locations ?? "Unlimited"}</span>
                      <span>Xendit Plan ID: {plan.xendit_plan_id || "Not linked"}</span>
                    </div>

                    <ul className="admin-plan-features">
                      {plan.features.map((feat) => (
                        <li key={feat}>
                          <Check size={14} /> {feat}
                        </li>
                      ))}
                    </ul>

                    {canMutate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPlan(plan)
                          setPlanFeaturesText(plan.features.join("\n"))
                        }}
                      >
                        Edit Plan
                      </Button>
                    )}
                  </article>
                ))}
              </div>

              <article className="admin-card">
                <div className="panel-heading">
                  <div>
                    <h2>How to Activate Xendit Paywall Later</h2>
                    <p>When you are ready to accept live GCash, Maya, Cards, and QRPH upgrades via Xendit:</p>
                  </div>
                </div>
                <div className="admin-detail-grid">
                  <div className="admin-kv">
                    <span>1. Supabase Edge Function Secrets</span>
                    <code>XENDIT_SECRET_KEY</code> and <code>XENDIT_CALLBACK_TOKEN</code>
                  </div>
                  <div className="admin-kv">
                    <span>2. Xendit Invoice Webhook URL</span>
                    <div className="admin-copy-row">
                      <code>{webhookUrlPreview}</code>
                      <button
                        type="button"
                        className="admin-copy-btn"
                        onClick={() => void handleCopyText("Webhook URL", webhookUrlPreview)}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="admin-kv">
                    <span>3. Deploy Edge Functions</span>
                    <code>supabase functions deploy xendit-create-checkout xendit-webhook</code>
                  </div>
                  <div className="admin-kv">
                    <span>4. Client Upgrade Flow</span>
                    <span>
                      Business owners click Upgrade in Settings → Billing, pay on Xendit, and <code>xendit-webhook</code> automatically upgrades their plan & writes an audit log.
                    </span>
                  </div>
                </div>
              </article>
            </div>
          )}

          {tab === "audit" && (
            <div className="admin-section">
              <div className="dashboard-page-heading">
                <div>
                  <p className="dashboard-kicker">Security & Compliance</p>
                  <h1>Audit Logs</h1>
                  <p>
                    Immutable log of admin actions, credential inspections, password updates, suspensions, and billing transitions.
                  </p>
                </div>
                {auditView === "admin" && (
                  <Button type="button" variant="outline" onClick={() => void handleExportAuditLogs()} disabled={!auditLogs.length}>
                    <Download data-icon="inline-start" />
                    Export Audit CSV
                  </Button>
                )}
              </div>

              <div className="admin-segmented">
                <button
                  type="button"
                  className={auditView === "admin" ? "active" : ""}
                  onClick={() => {
                    setAuditView("admin")
                    setAuditPage(1)
                  }}
                >
                  Platform & Admin Audit Logs ({auditTotal})
                </button>
                <button
                  type="button"
                  className={auditView === "security" ? "active" : ""}
                  onClick={() => {
                    setAuditView("security")
                    setAuditPage(1)
                  }}
                >
                  User Password & Security Logs ({securityTotal})
                </button>
              </div>

              <OwnerFilterBar
                onClear={
                  auditSearch || auditCategory !== "all" || auditSeverity !== "all"
                    ? () => {
                        setAuditSearch("")
                        setAuditCategory("all")
                        setAuditSeverity("all")
                        setAuditPage(1)
                      }
                    : undefined
                }
              >
                <input
                  className="admin-filter-input"
                  placeholder="Search actor email, target email, action, or summary…"
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value)
                    setAuditPage(1)
                  }}
                />
                {auditView === "admin" && (
                  <>
                    <select
                      className="admin-filter-select"
                      aria-label="Filter by category"
                      value={auditCategory}
                      onChange={(e) => {
                        setAuditCategory(e.target.value)
                        setAuditPage(1)
                      }}
                    >
                      <option value="all">All Categories</option>
                      <option value="admin">Admin</option>
                      <option value="auth">Auth</option>
                      <option value="subscription">Subscription</option>
                      <option value="billing">Billing / Xendit</option>
                      <option value="business">Business</option>
                      <option value="security">Security</option>
                    </select>
                    <select
                      className="admin-filter-select"
                      aria-label="Filter by severity"
                      value={auditSeverity}
                      onChange={(e) => {
                        setAuditSeverity(e.target.value)
                        setAuditPage(1)
                      }}
                    >
                      <option value="all">All Severities</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </>
                )}
              </OwnerFilterBar>

              {auditLoading ? (
                <div className="admin-card">Loading audit logs…</div>
              ) : auditView === "admin" ? (
                <OwnerDataTable
                  rows={auditLogs}
                  columns={auditColumns}
                  empty={<div className="admin-card">No audit logs match the current filters.</div>}
                />
              ) : (
                <OwnerDataTable
                  rows={securityLogs}
                  columns={securityColumns}
                  empty={<div className="admin-card">No user security logs found.</div>}
                />
              )}

              <OwnerPagination page={auditPage} pageCount={auditPageCount} onPageChange={setAuditPage} />
            </div>
          )}

          {tab === "admins" && (
            <div className="admin-section">
              <div className="dashboard-page-heading">
                <div>
                  <p className="dashboard-kicker">Access Control</p>
                  <h1>Platform Admins</h1>
                  <p>
                    Admins are managed in Supabase (<code>public.platform_admins</code>). Only verified users listed here can access this interface.
                  </p>
                </div>
              </div>

              <div className="admin-two-col">
                <article className="admin-card">
                  <div className="panel-heading">
                    <div>
                      <h2>Active & Configured Admins</h2>
                      <p>All changes to admin roles are logged as critical security events.</p>
                    </div>
                  </div>
                  {adminsLoading ? (
                    <p className="admin-muted">Loading admins…</p>
                  ) : (
                    <div className="admin-list-stack">
                      {platformAdmins.map((row) => (
                        <div className="admin-list-row" key={row.id}>
                          <div>
                            <strong>{row.email}</strong>
                            <div className="admin-inline-badges">
                              <OwnerStatusBadge label={row.role} tone={row.role === "super_admin" ? "info" : "neutral"} />
                              <OwnerStatusBadge
                                label={row.is_active ? "Active" : "Inactive"}
                                tone={row.is_active ? "success" : "danger"}
                              />
                              <OwnerStatusBadge
                                label={row.user_id ? "Auth Linked" : "Pending First Login"}
                                tone={row.user_id ? "success" : "warning"}
                              />
                            </div>
                            {row.notes && <small className="admin-muted">{row.notes}</small>}
                          </div>
                          {isSuperAdmin && row.user_id !== user.id && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleToggleAdminActive(row)}
                            >
                              {row.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="admin-card">
                  <div className="panel-heading">
                    <div>
                      <h2>Add Admin in UI or Supabase SQL</h2>
                      <p>Super admins can grant access here, or directly via Supabase Table Editor / SQL.</p>
                    </div>
                  </div>

                  {isSuperAdmin ? (
                    <form className="admin-form-stack" onSubmit={handleSavePlatformAdmin}>
                      <label className="admin-field">
                        <span>Admin Email (must be verified in Supabase Auth)</span>
                        <input
                          type="email"
                          required
                          placeholder="founder@bookoraph.com"
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                        />
                      </label>
                      <label className="admin-field">
                        <span>Role</span>
                        <select value={newAdminRole} onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}>
                          <option value="super_admin">super_admin (full access + manage admins)</option>
                          <option value="admin">admin (manage subscriptions & suspend users)</option>
                          <option value="support">support (read-only client & logs)</option>
                          <option value="viewer">viewer (read-only metrics)</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>Notes</span>
                        <input
                          placeholder="e.g. Co-founder or Ops lead"
                          value={newAdminNotes}
                          onChange={(e) => setNewAdminNotes(e.target.value)}
                        />
                      </label>
                      <Button type="submit" disabled={savingAdmin}>
                        {savingAdmin ? "Saving…" : "Grant Admin Access"}
                      </Button>
                    </form>
                  ) : (
                    <p className="admin-muted">Only a super_admin can add or modify platform admins from the UI.</p>
                  )}

                  <div className="admin-sql-box">
                    <div className="admin-sql-head">
                      <strong>Supabase SQL Snippet</strong>
                      <button
                        type="button"
                        className="admin-copy-btn"
                        onClick={() => void handleCopyText("SQL snippet", sqlAdminSnippet)}
                      >
                        <Copy size={14} /> Copy SQL
                      </button>
                    </div>
                    <pre>{sqlAdminSnippet}</pre>
                  </div>
                </article>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Client Detail Drawer */}
      <OwnerDrawer
        open={Boolean(selectedClientId)}
        title={
          clientDetail?.business_profile?.business_name
            ? String(clientDetail.business_profile.business_name)
            : clientDetail?.credentials.email || "Inspect Bookora Client"
        }
        onClose={() => {
          setSelectedClientId(null)
          setClientDetail(null)
        }}
      >
        {detailLoading || !clientDetail ? (
          <p className="admin-muted">Loading client credentials, profile & logs…</p>
        ) : (
          <div className="admin-drawer-body">
            <div className="admin-drawer-tabs" role="tablist">
              {(
                [
                  ["credentials", "Credentials"],
                  ["profile", "Business Profile"],
                  ["subscription", "Subscription"],
                  ["logs", "Logs"],
                ] as Array<[ClientDrawerTab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === key}
                  className={drawerTab === key ? "active" : ""}
                  onClick={() => setDrawerTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {drawerTab === "credentials" && (
              <div className="admin-drawer-section">
                <div className="admin-security-banner">
                  <Lock size={16} />
                  <div>
                    <strong>Password Security Policy</strong>
                    <p>
                      Supabase Auth hashes passwords with one-way bcrypt, so plaintext passwords are never readable. You can verify password status, auth providers, MFA, metadata, and trigger a password reset below.
                    </p>
                  </div>
                </div>

                <div className="admin-detail-grid">
                  <div className="admin-kv">
                    <span>User ID</span>
                    <div className="admin-copy-row">
                      <code>{clientDetail.credentials.user_id}</code>
                      <button
                        type="button"
                        className="admin-copy-btn"
                        onClick={() => void handleCopyText("User ID", clientDetail.credentials.user_id)}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="admin-kv">
                    <span>Primary Email</span>
                    <strong>{clientDetail.credentials.email || "—"}</strong>
                    <small>
                      {clientDetail.credentials.email_confirmed_at
                        ? `Verified ${formatDateTime(clientDetail.credentials.email_confirmed_at)}`
                        : "Email not verified"}
                    </small>
                  </div>
                  <div className="admin-kv">
                    <span>Auth Phone</span>
                    <strong>{clientDetail.credentials.phone || "Not set"}</strong>
                    <small>
                      {clientDetail.credentials.phone_confirmed_at
                        ? `Verified ${formatDateTime(clientDetail.credentials.phone_confirmed_at)}`
                        : "Not phone-verified"}
                    </small>
                  </div>
                  <div className="admin-kv">
                    <span>Password Status</span>
                    <OwnerStatusBadge
                      label={clientDetail.credentials.has_password ? "Password Set (bcrypt)" : "OAuth / Passwordless"}
                      tone={clientDetail.credentials.has_password ? "success" : "info"}
                    />
                    <small>Last changed: {formatDateTime(clientDetail.credentials.password_updated_at)}</small>
                  </div>
                  <div className="admin-kv">
                    <span>Last Sign-In</span>
                    <strong>{formatDateTime(clientDetail.credentials.last_sign_in_at)}</strong>
                    <small>Created: {formatDateTime(clientDetail.credentials.created_at)}</small>
                  </div>
                  <div className="admin-kv">
                    <span>Account Status</span>
                    <OwnerStatusBadge
                      label={clientDetail.credentials.is_suspended ? "Suspended" : "Active"}
                      tone={clientDetail.credentials.is_suspended ? "danger" : "success"}
                    />
                    {clientDetail.credentials.banned_until && (
                      <small>Banned until: {formatDateTime(clientDetail.credentials.banned_until)}</small>
                    )}
                  </div>
                </div>

                <div className="admin-subblock">
                  <h4>Linked Auth Identities</h4>
                  {clientDetail.credentials.identities.length === 0 ? (
                    <p className="admin-muted">No identity records found.</p>
                  ) : (
                    <div className="admin-pill-list">
                      {clientDetail.credentials.identities.map((id) => (
                        <div className="admin-identity-item" key={id.id}>
                          <KeyRound size={14} />
                          <div>
                            <strong>{id.provider}</strong>
                            <small>
                              {id.identity_email || "—"} · last sign-in {formatDateTime(id.last_sign_in_at)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-subblock">
                  <h4>MFA / 2FA Factors ({clientDetail.credentials.mfa_factors.length})</h4>
                  {clientDetail.credentials.mfa_factors.length === 0 ? (
                    <p className="admin-muted">No 2FA factors enrolled.</p>
                  ) : (
                    <div className="admin-pill-list">
                      {clientDetail.credentials.mfa_factors.map((f) => (
                        <div className="admin-identity-item" key={f.id}>
                          <ShieldCheck size={14} />
                          <div>
                            <strong>
                              {f.friendly_name || f.factor_type} ({f.status})
                            </strong>
                            <small>Enrolled {formatDateTime(f.created_at)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-subblock">
                  <h4>Raw User & App Metadata</h4>
                  <pre className="admin-json-pre">
                    {JSON.stringify(
                      {
                        user_metadata: clientDetail.credentials.raw_user_meta_data,
                        app_metadata: clientDetail.credentials.raw_app_meta_data,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>

                <div className="admin-actions-panel">
                  {clientDetail.credentials.email && (
                    <Button type="button" variant="outline" onClick={() => void handleSendPasswordReset()} disabled={sendingReset}>
                      <Mail data-icon="inline-start" />
                      {sendingReset ? "Sending…" : "Send Password Reset Email"}
                    </Button>
                  )}

                  {canMutate && clientDetail.credentials.user_id !== user.id && (
                    <div className="admin-suspend-box">
                      <input
                        placeholder="Reason for suspend/restore (logged to audit)"
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant={clientDetail.credentials.is_suspended ? "default" : "outline"}
                        className={clientDetail.credentials.is_suspended ? "" : "admin-danger-button"}
                        onClick={() => void handleToggleSuspension()}
                        disabled={suspending}
                      >
                        {clientDetail.credentials.is_suspended ? (
                          <>
                            <UserCheck data-icon="inline-start" /> Restore Account
                          </>
                        ) : (
                          <>
                            <UserX data-icon="inline-start" /> Suspend Account
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {drawerTab === "profile" && (
              <div className="admin-drawer-section">
                {!clientDetail.business_profile ? (
                  <p className="admin-muted">This user has not completed a business profile yet.</p>
                ) : (
                  <>
                    <div className="admin-detail-grid">
                      <div className="admin-kv">
                        <span>Business Name</span>
                        <strong>{String(clientDetail.business_profile.business_name || "—")}</strong>
                      </div>
                      <div className="admin-kv">
                        <span>Slug / Booking Link</span>
                        {clientDetail.business_profile.slug ? (
                          <a
                            className="admin-link"
                            href={`/book?slug=${encodeURIComponent(String(clientDetail.business_profile.slug))}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            /{String(clientDetail.business_profile.slug)} <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                      <div className="admin-kv">
                        <span>Industry</span>
                        <strong>{String(clientDetail.business_profile.industry || "—")}</strong>
                      </div>
                      <div className="admin-kv">
                        <span>Contact Email</span>
                        <strong>{String(clientDetail.business_profile.email || "—")}</strong>
                      </div>
                      <div className="admin-kv">
                        <span>Contact Phone</span>
                        <strong>
                          {String(clientDetail.business_profile.country_code || "")}{" "}
                          {String(clientDetail.business_profile.phone || "—")}
                        </strong>
                      </div>
                      <div className="admin-kv">
                        <span>Location</span>
                        <strong>
                          {[
                            clientDetail.business_profile.address,
                            clientDetail.business_profile.city,
                            clientDetail.business_profile.country,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </strong>
                      </div>
                      <div className="admin-kv">
                        <span>Branding</span>
                        <span>
                          Color: {String(clientDetail.business_profile.brand_color || "coral")} · Theme:{" "}
                          {String(clientDetail.business_profile.theme || "Light")}
                        </span>
                      </div>
                      <div className="admin-kv">
                        <span>Booking Rules</span>
                        <span>
                          Notice {String(clientDetail.business_profile.booking_min_notice_hours ?? 2)}h · Slot{" "}
                          {String(clientDetail.business_profile.booking_slot_size_minutes ?? 30)}m · Fee{" "}
                          {clientDetail.business_profile.booking_fee_enabled
                            ? formatCurrency(Number(clientDetail.business_profile.booking_fee_amount ?? 0))
                            : "Off"}
                        </span>
                      </div>
                    </div>

                    {Boolean(clientDetail.business_profile.about) && (
                      <div className="admin-subblock">
                        <h4>About</h4>
                        <p>{String(clientDetail.business_profile.about)}</p>
                      </div>
                    )}

                    <div className="admin-subblock">
                      <h4>Operational Usage</h4>
                      <div className="admin-usage-grid">
                        <div>
                          <strong>{clientDetail.stats.services_count}</strong>
                          <small>Services</small>
                        </div>
                        <div>
                          <strong>{clientDetail.stats.appointments_count}</strong>
                          <small>Appointments</small>
                        </div>
                        <div>
                          <strong>{clientDetail.stats.clients_count}</strong>
                          <small>Clients</small>
                        </div>
                        <div>
                          <strong>{clientDetail.stats.staff_count}</strong>
                          <small>Staff</small>
                        </div>
                        <div>
                          <strong>{formatCurrency(clientDetail.stats.paid_revenue_php)}</strong>
                          <small>Paid Revenue</small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {drawerTab === "subscription" && (
              <div className="admin-drawer-section">
                <div className="admin-detail-grid">
                  <div className="admin-kv">
                    <span>Current Plan</span>
                    <div className="admin-inline-badges">
                      <OwnerStatusBadge
                        label={clientDetail.subscription.plan_name}
                        tone={planTone(clientDetail.subscription.plan_code)}
                      />
                      <OwnerStatusBadge
                        label={clientDetail.subscription.status}
                        tone={subStatusTone(clientDetail.subscription.status)}
                      />
                    </div>
                  </div>
                  <div className="admin-kv">
                    <span>Billing Provider & Cycle</span>
                    <strong>
                      {clientDetail.subscription.billing_provider} · {clientDetail.subscription.billing_cycle} (
                      {formatCurrency(clientDetail.subscription.amount_php)})
                    </strong>
                  </div>
                  <div className="admin-kv">
                    <span>Period Start / End</span>
                    <span>
                      {formatDateTime(clientDetail.subscription.current_period_start)} →{" "}
                      {formatDateTime(clientDetail.subscription.current_period_end)}
                    </span>
                  </div>
                  <div className="admin-kv">
                    <span>Xendit References</span>
                    <small>
                      Customer: {clientDetail.subscription.xendit_customer_id || "—"} · Sub:{" "}
                      {clientDetail.subscription.xendit_subscription_id || "—"} · Invoice:{" "}
                      {clientDetail.subscription.xendit_latest_invoice_id || "—"}
                    </small>
                  </div>
                </div>

                {canMutate && (
                  <form className="admin-form-stack" onSubmit={handleSaveSubscription}>
                    <h4>Update / Assign Subscription</h4>
                    <div className="admin-form-row">
                      <label className="admin-field">
                        <span>Plan</span>
                        <select value={editPlanCode} onChange={(e) => setEditPlanCode(e.target.value)}>
                          {plans.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name} ({formatCurrency(p.monthly_price_php)}/mo)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>Status</span>
                        <select value={editSubStatus} onChange={(e) => setEditSubStatus(e.target.value)}>
                          <option value="active">Active</option>
                          <option value="trialing">Trialing</option>
                          <option value="past_due">Past Due</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="expired">Expired</option>
                        </select>
                      </label>
                    </div>
                    <div className="admin-form-row">
                      <label className="admin-field">
                        <span>Billing Provider</span>
                        <select value={editProvider} onChange={(e) => setEditProvider(e.target.value)}>
                          <option value="manual">Manual (Admin)</option>
                          <option value="promo">Promo / Complimentary</option>
                          <option value="xendit">Xendit</option>
                          <option value="system">System</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>Billing Cycle</span>
                        <select value={editCycle} onChange={(e) => setEditCycle(e.target.value)}>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                          <option value="lifetime">Lifetime</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                    </div>
                    <label className="admin-field">
                      <span>Current Period End (optional)</span>
                      <input type="date" value={editPeriodEnd} onChange={(e) => setEditPeriodEnd(e.target.value)} />
                    </label>
                    <label className="admin-field">
                      <span>Audit Note</span>
                      <input
                        placeholder="e.g. Upgraded to Pro via GCash bank transfer"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                    </label>
                    <Button type="submit" disabled={savingSub}>
                      {savingSub ? "Saving…" : "Save Subscription Change"}
                    </Button>
                  </form>
                )}

                {clientDetail.checkout_sessions.length > 0 && (
                  <div className="admin-subblock">
                    <h4>Xendit Checkout History</h4>
                    <div className="admin-list-stack">
                      {clientDetail.checkout_sessions.map((cs) => (
                        <div className="admin-list-row" key={cs.id}>
                          <div>
                            <strong>
                              {cs.target_plan_code.toUpperCase()} ({cs.billing_cycle}) — {formatCurrency(cs.amount_php)}
                            </strong>
                            <small>
                              {cs.external_id} · {formatDateTime(cs.created_at)}
                            </small>
                          </div>
                          <OwnerStatusBadge
                            label={cs.status}
                            tone={cs.status === "paid" ? "success" : cs.status === "failed" ? "danger" : "warning"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {drawerTab === "logs" && (
              <div className="admin-drawer-section">
                <div className="admin-subblock">
                  <h4>Recent Audit Events</h4>
                  {clientDetail.recent_audit_logs.length === 0 ? (
                    <p className="admin-muted">No audit events for this client yet.</p>
                  ) : (
                    <div className="admin-list-stack">
                      {clientDetail.recent_audit_logs.map((log) => (
                        <div className="admin-list-row" key={log.id}>
                          <div>
                            <strong>{log.summary}</strong>
                            <small>
                              <code>{log.action}</code> · {log.actor_email || "system"} · {formatDateTime(log.created_at)}
                            </small>
                          </div>
                          <OwnerStatusBadge label={log.severity} tone={severityTone(log.severity)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-subblock">
                  <h4>Password & Security Logs</h4>
                  {clientDetail.recent_security_logs.length === 0 ? (
                    <p className="admin-muted">No password/security log rows for this user.</p>
                  ) : (
                    <div className="admin-list-stack">
                      {clientDetail.recent_security_logs.map((sl) => (
                        <div className="admin-list-row" key={sl.id}>
                          <div>
                            <strong>{sl.action}</strong>
                            <small>
                              {sl.details || "—"} · {formatDateTime(sl.created_at)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </OwnerDrawer>

      {/* Audit Log JSON Inspector Drawer */}
      <OwnerDrawer
        open={Boolean(inspectedLog)}
        title={inspectedLog ? `Audit Event: ${inspectedLog.action}` : "Audit Event"}
        onClose={() => setInspectedLog(null)}
      >
        {inspectedLog && (
          <div className="admin-drawer-section">
            <div className="admin-detail-grid">
              <div className="admin-kv">
                <span>Timestamp</span>
                <strong>{formatDateTime(inspectedLog.created_at)}</strong>
              </div>
              <div className="admin-kv">
                <span>Severity & Category</span>
                <div className="admin-inline-badges">
                  <OwnerStatusBadge label={inspectedLog.severity} tone={severityTone(inspectedLog.severity)} />
                  <OwnerStatusBadge label={inspectedLog.category} tone="neutral" />
                </div>
              </div>
              <div className="admin-kv">
                <span>Actor</span>
                <strong>
                  {inspectedLog.actor_email || "system"} ({inspectedLog.actor_role})
                </strong>
              </div>
              <div className="admin-kv">
                <span>Target</span>
                <strong>{inspectedLog.target_email || inspectedLog.target_user_id || "—"}</strong>
              </div>
            </div>
            <div className="admin-subblock">
              <h4>Summary</h4>
              <p>{inspectedLog.summary}</p>
            </div>
            {inspectedLog.before_state && (
              <div className="admin-subblock">
                <h4>Before State</h4>
                <pre className="admin-json-pre">{JSON.stringify(inspectedLog.before_state, null, 2)}</pre>
              </div>
            )}
            {inspectedLog.after_state && (
              <div className="admin-subblock">
                <h4>After State</h4>
                <pre className="admin-json-pre">{JSON.stringify(inspectedLog.after_state, null, 2)}</pre>
              </div>
            )}
            <div className="admin-subblock">
              <h4>Metadata</h4>
              <pre className="admin-json-pre">{JSON.stringify(inspectedLog.metadata || {}, null, 2)}</pre>
            </div>
          </div>
        )}
      </OwnerDrawer>

      {/* Plan Editor Drawer */}
      <OwnerDrawer
        open={Boolean(editingPlan)}
        title={editingPlan?.code ? `Edit Plan: ${editingPlan.name}` : "Add Subscription Plan"}
        onClose={() => setEditingPlan(null)}
      >
        {editingPlan && (
          <form className="admin-form-stack" onSubmit={handleSavePlan}>
            <div className="admin-form-row">
              <label className="admin-field">
                <span>Plan Code (slug)</span>
                <input
                  required
                  placeholder="e.g. growth"
                  value={editingPlan.code}
                  onChange={(e) => setEditingPlan({ ...editingPlan, code: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Display Name</span>
                <input
                  required
                  placeholder="e.g. Growth"
                  value={editingPlan.name}
                  onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                />
              </label>
            </div>
            <label className="admin-field">
              <span>Description</span>
              <input
                value={editingPlan.description}
                onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
              />
            </label>
            <div className="admin-form-row">
              <label className="admin-field">
                <span>Monthly Price (PHP)</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={editingPlan.monthly_price_php}
                  onChange={(e) => setEditingPlan({ ...editingPlan, monthly_price_php: Number(e.target.value) })}
                />
              </label>
              <label className="admin-field">
                <span>Annual Price (PHP)</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={editingPlan.annual_price_php}
                  onChange={(e) => setEditingPlan({ ...editingPlan, annual_price_php: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="admin-form-row">
              <label className="admin-field">
                <span>Max Staff (blank = unlimited)</span>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.max_staff ?? ""}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, max_staff: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
              <label className="admin-field">
                <span>Max Locations (blank = unlimited)</span>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.max_locations ?? ""}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, max_locations: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </div>
            <label className="admin-field">
              <span>Xendit Plan ID (optional, for recurring billing)</span>
              <input
                placeholder="repl_..."
                value={editingPlan.xendit_plan_id || ""}
                onChange={(e) => setEditingPlan({ ...editingPlan, xendit_plan_id: e.target.value || null })}
              />
            </label>
            <label className="admin-field">
              <span>Features (one per line)</span>
              <textarea rows={5} value={planFeaturesText} onChange={(e) => setPlanFeaturesText(e.target.value)} />
            </label>
            <div className="admin-form-row">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={editingPlan.is_active}
                  onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                />
                <span>Plan is active</span>
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={editingPlan.is_public}
                  onChange={(e) => setEditingPlan({ ...editingPlan, is_public: e.target.checked })}
                />
                <span>Visible on owner upgrade screen</span>
              </label>
            </div>
            <Button type="submit" disabled={savingPlan}>
              {savingPlan ? "Saving…" : "Save Subscription Plan"}
            </Button>
          </form>
        )}
      </OwnerDrawer>
    </div>
  )
}
