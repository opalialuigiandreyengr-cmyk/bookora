import { supabase } from "@/lib/supabase"

export async function sendAppointmentUpdateEmail(input: {
  businessId: string
  appointmentId: string
  eventType: "booking_confirmation" | "cancellation" | "reschedule" | "reminder"
  appointmentDate?: string
  appointmentTime?: string
}) {
  if (!supabase) return { ok: false, error: "Email service is unavailable" }
  const result = await supabase.functions.invoke("send-appointment-update-email", { body: input })
  if (result.error) {
    const context = (result.error as { context?: Response }).context
    let detail = result.error.message
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string; message?: string; reason?: string }
        detail = responseBody.error || responseBody.message || responseBody.reason || detail
      } catch {
        // Keep the SDK message when the function did not return JSON.
      }
    }
    return { ok: false, error: detail }
  }
  if (result.data?.skipped) return { ok: false, error: result.data.reason || "Email was skipped" }
  return { ok: true }
}
