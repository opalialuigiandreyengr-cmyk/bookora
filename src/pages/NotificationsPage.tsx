import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { Bell, Check, Clock3, Mail, MessageSquareText, Save } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"

type NotificationSettings = { email_enabled: boolean; sms_enabled: boolean; customer_confirmation_enabled: boolean; staff_confirmation_enabled: boolean; reminder_enabled: boolean; reminder_lead_hours: number; no_show_followup_enabled: boolean; no_show_followup_delay_hours: number; sender_name: string; email_signature: string; quiet_hours_start: string; quiet_hours_end: string }
type NotificationEvent = { id: string; event_type: string; channel: string; recipient: string; status: "sent" | "failed" | "scheduled" | "processing"; provider_message: string; created_at: string }
const defaults: NotificationSettings = { email_enabled: true, sms_enabled: false, customer_confirmation_enabled: true, staff_confirmation_enabled: true, reminder_enabled: true, reminder_lead_hours: 24, no_show_followup_enabled: false, no_show_followup_delay_hours: 24, sender_name: "Bookora", email_signature: "", quiet_hours_start: "", quiet_hours_end: "" }

export function NotificationsPage({ user }: { user: User; onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>(defaults)
  const [events, setEvents] = useState<NotificationEvent[]>([])
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("")
  const isLive = Boolean(supabase && user.id !== "preview-user-123"); const storageKey = `bookora-notification-settings-${user.id}`

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (isLive && supabase) {
        const [settingsResult, eventsResult] = await Promise.all([
          supabase.from("notification_settings").select("email_enabled, sms_enabled, customer_confirmation_enabled, staff_confirmation_enabled, reminder_enabled, reminder_lead_hours, no_show_followup_enabled, no_show_followup_delay_hours, sender_name, email_signature, quiet_hours_start, quiet_hours_end").eq("business_id", user.id).maybeSingle(),
          supabase.from("notification_events").select("id, event_type, channel, recipient, status, provider_message, created_at").eq("business_id", user.id).order("created_at", { ascending: false }).limit(8),
        ])
        if (!active) return
        if (settingsResult.error) setError(settingsResult.error.message)
        else if (settingsResult.data) setSettings({ ...defaults, ...settingsResult.data, quiet_hours_start: String(settingsResult.data.quiet_hours_start || "").slice(0, 5), quiet_hours_end: String(settingsResult.data.quiet_hours_end || "").slice(0, 5) })
        if (!eventsResult.error) setEvents((eventsResult.data || []) as NotificationEvent[])
      } else {
        try { const cached = window.localStorage.getItem(storageKey); if (cached && active) setSettings({ ...defaults, ...JSON.parse(cached) }) } catch { /* keep defaults */ }
      }
      if (active) setLoading(false)
    }
    void load(); return () => { active = false }
  }, [isLive, storageKey, user.id])

  const update = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const save = async () => {
    const senderName = settings.sender_name.trim()
    if (!senderName) { showToast("Add a sender name before saving.", "error"); return }
    if ((settings.quiet_hours_start && !settings.quiet_hours_end) || (!settings.quiet_hours_start && settings.quiet_hours_end)) { showToast("Set both quiet-hours times or leave both blank.", "error"); return }
    setSaving(true)
    const payload = { business_id: user.id, ...settings, sender_name: senderName, email_signature: settings.email_signature.trim(), quiet_hours_start: settings.quiet_hours_start || null, quiet_hours_end: settings.quiet_hours_end || null, updated_at: new Date().toISOString() }
    if (isLive && supabase) { const result = await supabase.from("notification_settings").upsert(payload, { onConflict: "business_id" }); if (result.error) { setError(result.error.message); showToast("Notification settings could not be saved.", "error"); setSaving(false); return } }
    else window.localStorage.setItem(storageKey, JSON.stringify(payload))
    setSaving(false); showToast("Notification settings saved")
  }
  const retryEvent = async (eventId: string) => { if (!supabase) return; const result = await supabase.rpc("retry_notification_event", { p_event_id: eventId }); if (result.error) { showToast("Notification could not be requeued.", "error"); return }; if (result.data) { setEvents((current) => current.map((event) => event.id === eventId ? { ...event, status: "scheduled" } : event)); showToast("Notification requeued") } else showToast("This notification reached the retry limit.", "error") }
  const toggle = <K extends keyof NotificationSettings>(key: K, title: string, description: string, icon: typeof Mail) => { const Icon = icon; return <label className="notification-setting-row"><span className="notification-setting-icon"><Icon size={17} /></span><span className="notification-setting-copy"><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => update(key, event.target.checked as NotificationSettings[K])} /><span className="notification-switch" aria-hidden="true" /></label> }

  return <div className="dashboard-shell notifications-page-shell"><OwnerSidebar user={user} active="Notifications" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} /><div className="dashboard-content"><header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Notifications</span><small>Owner workspace</small></div></header><main className="dashboard-main notifications-main"><div className="dashboard-page-heading"><div><p className="dashboard-kicker">Automation, with control</p><h1>Notifications</h1><p>Set the rules notification workers use for customers, staff, reminders, and follow-ups.</p></div><button className="notifications-save-button" type="button" onClick={() => void save()} disabled={saving || loading}><Save size={16} /> {saving ? "Saving…" : "Save changes"}</button></div>{error && <div className="notifications-error" role="alert">{error}</div>}<div className="notifications-grid"><section className="notifications-card"><div className="notifications-card-heading"><div><span className="notifications-card-icon"><Bell size={18} /></span><h2>Booking updates</h2><p>Keep each appointment state visible to the right people.</p></div></div><div className="notification-settings-list">{toggle("customer_confirmation_enabled", "Customer confirmations", "Email customers when a booking request is received.", Mail)}{toggle("staff_confirmation_enabled", "Staff notifications", "Notify the owner and assigned team when a booking arrives.", Bell)}{toggle("reminder_enabled", "Appointment reminders", "Prepare a reminder before upcoming appointments.", Clock3)}{toggle("no_show_followup_enabled", "No-show follow-up", "Send a delayed follow-up after an appointment is marked no-show.", MessageSquareText)}</div><label className="notification-select-field"><span>Reminder lead time</span><select value={settings.reminder_lead_hours} disabled={!settings.reminder_enabled} onChange={(event) => update("reminder_lead_hours", Number(event.target.value))}><option value={2}>2 hours before</option><option value={24}>24 hours before</option><option value={48}>48 hours before</option><option value={72}>72 hours before</option></select></label><label className="notification-select-field"><span>No-show follow-up delay</span><select value={settings.no_show_followup_delay_hours} disabled={!settings.no_show_followup_enabled} onChange={(event) => update("no_show_followup_delay_hours", Number(event.target.value))}><option value={2}>2 hours after</option><option value={24}>24 hours after</option><option value={48}>48 hours after</option><option value={72}>72 hours after</option></select></label><div className="notification-quiet-hours"><strong>Quiet hours</strong><small>Reminders and follow-ups queued during this window wait until it ends.</small><div><label>Start<input type="time" value={settings.quiet_hours_start} onChange={(event) => update("quiet_hours_start", event.target.value)} /></label><label>End<input type="time" value={settings.quiet_hours_end} onChange={(event) => update("quiet_hours_end", event.target.value)} /></label></div></div></section><section className="notifications-card"><div className="notifications-card-heading"><div><span className="notifications-card-icon"><MessageSquareText size={18} /></span><h2>Delivery channels</h2><p>Email is available now. SMS uses the configured provider adapter.</p></div></div><div className="notification-settings-list">{toggle("email_enabled", "Email delivery", "Use email for confirmations and reminders.", Mail)}{toggle("sms_enabled", "SMS delivery", "Use SMS when a provider is configured.", MessageSquareText)}</div><label className="notification-input-field"><span>Sender name</span><input maxLength={80} value={settings.sender_name} onChange={(event) => update("sender_name", event.target.value)} placeholder="Your business name" /></label><label className="notification-input-field"><span>Email signature</span><textarea maxLength={1000} rows={4} value={settings.email_signature} onChange={(event) => update("email_signature", event.target.value)} placeholder="Thanks,\nYour team" /></label></section></div><section className="notifications-history-card"><div className="notifications-history-heading"><div><h2>Recent delivery history</h2><p>Owner-only records from notification workers.</p></div><span>{events.length} recent</span></div>{events.length === 0 ? <div className="notifications-history-empty"><Mail size={18} /><span>No deliveries recorded yet.</span></div> : <div className="notifications-history-list">{events.map((event) => <div className="notifications-history-row" key={event.id}><span className={`notification-event-status ${event.status}`}><Check size={13} />{event.status}</span><div><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{event.recipient} · {new Date(event.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</small></div><span className="notification-event-channel">{event.channel}</span>{event.status === "failed" && <button type="button" className="notification-retry-button" onClick={() => void retryEvent(event.id)}>Retry</button>}</div>)}</div>}</section></main></div></div>
}
