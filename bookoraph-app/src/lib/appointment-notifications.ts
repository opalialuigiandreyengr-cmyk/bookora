import { supabase } from '@/lib/supabase';

export async function sendAppointmentUpdateEmail(input: {
  businessId: string;
  appointmentId: string;
  eventType: 'booking_confirmation' | 'cancellation' | 'final_amount' | 'reschedule' | 'reminder';
  appointmentDate?: string;
  appointmentTime?: string;
}) {
  if (!supabase) return { ok: false, error: 'Email service is unavailable' };
  try {
    const result = await supabase.functions.invoke('send-appointment-update-email', { body: input });
    if (result.error) {
      return { ok: false, error: result.error.message || 'Email delivery failed' };
    }
    if (result.data?.skipped) {
      return { ok: false, error: result.data.reason || 'Email was skipped' };
    }
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: message };
  }
}

