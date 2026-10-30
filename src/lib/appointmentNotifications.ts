import { supabase } from "@/lib/supabase"

export async function sendAppointmentUpdateEmail(input: {
  businessId: string
  appointmentId: string
  eventType: "cancellation" | "reschedule"
  appointmentDate?: string
  appointmentTime?: string
}) {
  if (!supabase) return { ok: false, error: "Email service is unavailable" }
  const result = await supabase.functions.invoke("send-appointment-update-email", { body: input })
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}
