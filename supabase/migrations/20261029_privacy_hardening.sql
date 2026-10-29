-- Public booking pages must never read owner-only operational data.
-- RLS already protects these tables for authenticated users; these explicit
-- revokes also prevent an accidental broad grant from exposing private fields.
revoke all on table public.clients from anon;
revoke all on table public.payment_transactions from anon;
revoke all on table public.notification_events from anon;
revoke all on table public.notification_settings from anon;
revoke all on table public.staff_members from anon;
revoke all on table public.staff_service_assignments from anon;
revoke all on table public.report_schedules from anon;
revoke all on table public.integration_connections from anon;

-- Customers submit bookings through the narrow insert policy only. They do
-- not receive a general read path for the appointments table.
revoke select, update, delete on table public.appointments from anon;

