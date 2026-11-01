import { Bell, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

type AppointmentReminderModalProps = {
  customerName: string
  customerEmail: string
  sending: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function AppointmentReminderModal({ customerName, customerEmail, sending, onCancel, onConfirm }: AppointmentReminderModalProps) {
  return (
    <div className="appointment-reminder-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) onCancel() }}>
      <section className="appointment-reminder-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-reminder-title">
        <div className="appointment-reminder-icon"><Bell size={18} /></div>
        <h3 id="appointment-reminder-title">Send appointment reminder?</h3>
        <p>Send one email reminder to <strong>{customerName}</strong> at <strong>{customerEmail}</strong>. This can only be sent once.</p>
        <div className="appointment-reminder-actions">
          <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>Cancel</Button>
          <Button type="button" className="cal-action-complete" disabled={sending} onClick={onConfirm}>{sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Mail size={15} /> Send reminder</>}</Button>
        </div>
      </section>
    </div>
  )
}
