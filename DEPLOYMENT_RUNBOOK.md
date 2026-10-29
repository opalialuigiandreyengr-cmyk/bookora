# Bookora deployment runbook

The repository contains durable queues and Edge Functions; production delivery requires a scheduler to invoke the workers.

## Required secrets

Set these in the Supabase project hosting the functions:

- `NOTIFICATION_WORKER_SECRET` — shared secret sent as `x-worker-secret` to notification, scheduled-report, and outbound-webhook workers.
- `SUPABASE_SERVICE_ROLE_KEY` — supplied by the Supabase runtime.
- `SUPABASE_URL` — supplied by the Supabase runtime.
- `RESEND_API_KEY` — required for email and scheduled report delivery.
- `SMS_PROVIDER_URL`, `SMS_PROVIDER_API_KEY`, and optional `SMS_FROM_NUMBER` — required when SMS is enabled.

## Worker schedule

Invoke these functions with `POST` and the `x-worker-secret` header:

- `process-notification-events` every minute
- `process-scheduled-reports` every 15 minutes
- `process-outbound-webhooks` every minute

The workers claim rows atomically, recover stale claims, and retry failures. A scheduler may be Supabase Edge Function scheduling, an external cron service, or a platform job runner. Do not expose the worker secret in browser code.

## Smoke checks after deployment

1. Send an appointment through the public booking flow and confirm a scheduled notification event exists.
2. Mark an appointment no-show with follow-up enabled and confirm a future `no_show_followup` event.
3. Create a webhook endpoint, create an appointment, and confirm the signed delivery reaches the endpoint.
4. Invoke a worker without `x-worker-secret`; it must return `401`.
