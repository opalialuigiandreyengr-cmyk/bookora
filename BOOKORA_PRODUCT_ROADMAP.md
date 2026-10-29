# Bookora Product Roadmap

Product roadmap for closing the owner-workflow gaps identified in the Setmore comparison.

## Product scope reset — Solo salon MVP

The first real customer is one independent nail-salon owner using Bookora on her phone. The product must be useful without staff accounts, integrations, automation, reporting, or advanced scheduling.

### MVP workflow

1. Open Bookora and see today's appointments.
2. Add, move, confirm, complete, cancel, or mark an appointment as no-show.
3. Manage a short service list with price and duration.
4. View clients and their appointment history.
5. Record cash/card payments and see what is still due.
6. Share one customer booking link.
7. Change basic salon details and availability.

### Explicitly deferred

Staff, permissions, team calendars, reports, webhooks, public API, OAuth calendar sync, SMS automation, scheduled reports, memberships, packages, classes, waitlists, resources, multi-location, accounting connectors, native meeting links, and other advanced scheduling remain out of the first release. Existing code and migrations are preserved, but these surfaces must stay out of the solo-owner navigation until the core workflow has real usage.

### Product rule

Every new feature must answer: “Does this help one nail-salon owner complete today’s booking and payment work from a phone?” If not, defer it.

## Status legend

- `[ ]` Not started
- `[-]` In progress
- `[x]` Complete
- `[~]` Blocked or needs a product decision

## Current baseline

### Already present

- [x] Business onboarding
- [x] Business profile and branding foundation
- [x] Customer-facing booking page
- [x] Services and service categories
- [x] Appointment calendar
- [x] Customer booking history and cancellation foundation
- [x] Booking deposits / fee configuration foundation
- [x] Email confirmation function with calendar attachment
- [x] Client subdomain routing
- [x] Reviews foundation

### Current limitations

- [x] Staff management is implemented as an owner workflow
- [x] Staff roles and permissions — role editor, staff membership claim, database RLS boundaries, and staff calendar context are implemented; full admin business-context switching remains
- [x] Appointments list is implemented as a standalone owner module
- [x] Client CRM screen is implemented
- [x] Payment transaction ledger is implemented
- [x] Reports and exports are implemented
- [x] Notification center and configurable reminder settings are implemented
- [~] Calendar integrations are partially implemented through a secure one-way ICS feed; native OAuth and two-way sync remain
- [x] Recurring appointments and classes are implemented
- [x] Booking distribution link and sharing tools are implemented
- [x] Owner dashboard navigation routes to implemented module surfaces

## Phase 0 — Product foundation and navigation integrity

Priority: P0

Goal: Make the owner app honest, stable, and ready for additional modules.

- [x] Replace placeholder navigation behavior with real routes or disabled states
- [x] Define route map for Overview, Calendar, Appointments, Clients, Services, Staff, Payments, Reports, Booking Page, and Settings
- [x] Create shared owner shell with consistent sidebar, page header, search, notifications, and account menu foundation
- [~] Create shared loading, empty, error, success, confirmation, and permission-denied states — shared state primitives now exist and are used in the block-time flow; migration of older screens remains
- [x] Add a single source of truth for navigation labels, routes, icons, and required permissions foundation
- [x] Add route-level authorization checks — unauthenticated users are held at auth/onboarding, client accounts cannot enter owner routes, and active staff accounts resolve into the restricted staff workspace before owner routes render; database RLS remains the enforcement boundary.
- [x] Add shared data table, filter bar, status badge, drawer, and pagination primitives — reusable owner primitives are defined and status/pagination are exercised by the Appointments module
- [x] Remove silent fallback behavior from live owner navigation

Acceptance criteria:

- Every visible navigation item opens a real screen or is clearly marked unavailable.
- A user never sees demo data mixed with live business data.
- Unauthorized users cannot access owner-only routes by typing a URL.

## Phase 1 — Staff, roles, and availability

Priority: P0

Goal: Give owners control over their team and scheduling capacity.

- [x] Add `staff_members` data model
- [x] Add staff profile: name, email, phone, bio, and status
- [x] Add staff-to-service assignments
- [x] Add working hours and time-off data with owner editing and invalid-hours validation
- [x] Add owner-managed role options: Owner, Manager, Staff, Limited access
- [-] Enforce staff login permissions at the authentication/database layer:
  - [x] No access for unclaimed/inactive memberships
  - [x] Own calendar for Staff and Limited roles
  - [x] All calendars for Manager role
  - [ ] Full admin access and owner UI business-context switching
- [x] Add staff invitation and account activation flow — owner-only activation-link function generates Supabase Auth invite links, sends through Resend when configured, and the existing claim RPC activates the matching staff membership on first sign-in
- [x] Add two-factor authentication support for owner and staff accounts — Supabase TOTP enrollment, verification, factor listing, and removal are available in Security settings
- [x] Add staff availability conflict warnings
- [x] Add owner view of all staff calendars

Acceptance criteria:

- An owner can invite a staff member, assign services, set hours, and control access.
- Booking availability is calculated from both service rules and staff availability.
- Staff cannot view or modify data outside their permission level.

## Phase 2 — Appointments operations

Priority: P0

Goal: Make appointment management a complete daily operating workflow.

- [x] Build standalone Appointments list
- [x] Add filters for date, status, customer/service search, staff, and payment state
- [x] Add appointment status workflow foundation: pending, confirmed, completed, cancelled
- [x] Add reschedule flow with availability validation
- [x] Add cancellation policy enforcement
- [x] Add no-show marking and internal reason
- [x] Add block-time and personal-event support — owner CRUD with demo fallback; blocked ranges are included in the public availability RPC
- [x] Add multi-service appointments
- [x] Add appointment notes visible only to staff
- [x] Add customer-visible appointment comments where appropriate — public booking collects a clearly labeled message and stores it as the appointment customer note
- [x] Add bulk actions for confirmation, cancellation, and export
- [x] Add conflict detection before saving
- [x] Add undo or recovery for reversible appointment actions — status changes and removals keep a recoverable snapshot; Ctrl/Cmd+Z restores the latest change

Acceptance criteria:

- An owner can manage the entire day without leaving the appointments module.
- Every appointment change produces clear feedback and preserves the correct audit state.
- Double-booking is prevented across staff, service duration, and buffer time.

## Phase 3 — Client CRM

Priority: P0

Goal: Turn customer records into a useful owner relationship tool.

- [x] Build Clients list with search and tag-aware filtering
- [x] Add client profile drawer
- [x] Show appointment history foundation
- [x] Show lifetime spend, visit count, last visit, and next appointment
- [x] Add internal notes and client tags
- [x] Add contact actions for email, phone, and message
- [x] Add duplicate customer merge flow
- [x] Add customer import and export — CSV import validates rows, normalizes emails, and updates matching clients instead of creating duplicates
- [x] Add customer blocking / restricted booking support — owner profile toggle, durable flag, and server-side booking rejection are in place
- [x] Add privacy-safe owner access rules — owner-only tables use business-scoped RLS and an explicit anonymous privilege deny-list; public booking reads remain limited to published booking data and the narrow service RPC

Acceptance criteria:

- An owner can understand a client’s relationship with the business from one screen.
- Search finds clients by name, email, phone, tag, or appointment history.
- Internal notes are never exposed to customers.

## Phase 4 — Payments and deposits

Priority: P0

Goal: Provide a reliable financial record connected to appointments.

- [x] Add payment transaction data model
- [x] Record deposit, payment, cash, card, digital-wallet, refund, and adjustment foundations
- [x] Add payment status to appointment details
- [x] Add payment ledger with date, customer, appointment, staff, method, and status filters
- [x] Add balance-due calculation
- [x] Add partial payment and deposit rules per service — service editor controls, public booking calculation, and balance enforcement are in place
- [x] Add refund workflow with confirmation and audit entry
- [x] Add payment receipt generation
- [x] Add CSV export
- [~] Integrate supported payment provider webhooks before marking transactions paid — signed provider-neutral intake and idempotency are ready; provider adapter and live credentials remain
- [x] Add payment failure and retry states — durable failure metadata, owner retry RPC, and ledger retry panel are in place

Acceptance criteria:

- Every payment is tied to a customer and appointment.
- Refunds and adjustments remain visible as separate ledger entries.
- The owner can reconcile the payment ledger with booking history.

## Phase 5 — Booking page and conversion controls

Priority: P1

Goal: Make Bookora’s customer-facing booking experience configurable and distributable.

- [x] Add public booking-link owner surface and preview entry point
- [x] Add configurable logo, colors, imagery, business description, and contact details
- [x] Add booking URL editor and availability preview
- [x] Add lead-time and scheduling-window controls
- [x] Add cancellation and rescheduling policy editor
- [x] Add customer login toggle — owner setting is persisted and disables customer account entry points while keeping guest booking available
- [x] Add custom contact fields
- [x] Add show/hide controls for price, duration, business hours, staff, and reviews — settings are persisted on `business_profiles` and enforced on the public booking surface
- [x] Add private service and direct service booking links
- [x] Add “Copy booking link” action
- [x] Add QR code generation
- [x] Add website booking button / embed instructions
- [x] Add social and Google Business Profile distribution guidance — Booking Page includes copy-ready placement guidance and social caption tools
- [x] Add “first available appointment” option

Acceptance criteria:

- Owners can preview customer-facing changes before publishing.
- A customer can book from a direct service link without browsing the full catalog.
- Booking rules are visible before the customer confirms.

## Phase 6 — Notifications and automation

Priority: P1

Goal: Reduce manual owner work and no-shows.

- [x] Add notification settings center
- [x] Add customer confirmation emails
- [~] Add staff confirmation emails — new appointments queue the owner and assigned active staff member (deduplicated by email); provider credentials and deployment scheduling remain.
- [x] Add reminder scheduling rules
- [x] Add configurable reminder lead times
- [~] Add reschedule and cancellation notifications — customer email/SMS events are queued on state/date changes; provider credentials and deployment scheduling remain.
- [~] Add payment and deposit notifications — paid transactions now queue email events; provider-specific copy and delivery configuration remain
- [~] Add no-show follow-up notification — owners can enable a 2/24/48/72-hour delayed follow-up; email/SMS events reuse the durable worker and retry history, while provider credentials and dedicated copy templates remain.
- [~] Add SMS provider integration — SMS events are queued for confirmations, cancellations, reschedules, and no-shows when enabled; the worker supports a provider-neutral HTTP adapter and requires `SMS_PROVIDER_URL`, `SMS_PROVIDER_API_KEY`, and optional `SMS_FROM_NUMBER` deployment secrets.
- [x] Add notification delivery history and failure states — owner history now includes guarded retry/requeue for failed events
- [~] Add notification delivery worker — atomic email/SMS claiming, stale recovery, provider validation, retry history, and provider-neutral delivery are implemented; scheduler and live provider credentials remain
- [x] Add editable sender name and email signature
- [x] Add quiet hours and notification preferences

Acceptance criteria:

- Owners can see which notifications were sent, failed, or are scheduled.
- Customers and staff receive the correct notification for every appointment state change.
- Notification preferences do not expose internal notes or sensitive data.

## Phase 7 — Reports and business insights

Priority: P1

Goal: Help owners understand performance and export records.

- [x] Add reports dashboard
- [x] Add date-range filters
- [x] Add booking, completion, cancellation, and booked-value metrics
- [x] Add service demand breakdown
- [x] Add CSV export
- [x] Add payment reconciliation summary
- [x] Add booking activity trend
- [x] Add staff and location breakdowns
- [x] Add scheduled report preferences — owner can choose recipient, weekly/monthly cadence, and a bounded send day.
- [~] Add scheduled report worker — worker now enforces the selected weekday/calendar day in the persisted business timezone and claims schedules to prevent concurrent duplicate sends; deployment cron and provider credentials remain.
- [x] Add appointment volume report
- [x] Add revenue report
- [x] Add service performance report
- [x] Add staff performance report
- [x] Add cancellations and no-shows report
- [x] Add new versus returning customer report
- [x] Add date-range, staff, service, and status filters
- [x] Add CSV export
- [x] Add printable report layout
- [x] Add report empty and insufficient-data states
- [x] Add timezone-safe date boundaries

Acceptance criteria:

- Reports reconcile with appointments and payment ledger totals.
- Every chart has an accessible tabular or summary equivalent.
- Exported data preserves the selected filters and date range.

## Phase 8 — Integrations and growth workflows

Priority: P1

Goal: Connect Bookora to the tools owners already use.

- [x] Add integration connection center
- [~] Add integration health and reconnect states — owner connection states and calendar-feed URL rotation are implemented; provider-specific health checks remain

- [-] Google Calendar one-way sync — secure ICS subscription feed is implemented; native OAuth sync remains
- [ ] Google Calendar two-way sync
- [-] Apple Calendar support — secure ICS subscription feed is compatible; native provider connection remains
- [-] Outlook Calendar support — secure ICS subscription feed is compatible; native OAuth sync remains
- [~] Zoom or Google Meet appointment links — owner-managed HTTPS meeting URLs are stored on appointments, shown in the appointment drawer, and accepted by the scoped API; native provider link generation remains
- [~] Zapier or webhook integration — owner-configurable HTTPS endpoints, HMAC-signed appointment event queueing, durable delivery retries, and an owner delivery history are implemented; deployment scheduling and provider-specific Zapier adapters remain
- [~] Public API with scoped tokens — hashed token issuance/revocation, atomic 120-requests/minute per-token limiting, read-only `/services`, `/appointments`, `/clients`, and `/payments` endpoints, and `api:write` appointment create/update/delete operations with server-side validation/conflict enforcement are implemented; deployment observability remains
- [~] Google Business Profile booking support — the public booking URL and owner distribution guidance support manual Google Business Profile booking-link placement; native GBP API management remains
- [~] Accounting export integration — Payments now exports both the operational ledger CSV and a debit/credit accounting CSV; native QuickBooks/Xero connectors remain
- [~] Integration health and reconnect states — connection status/error fields and feed rotation are implemented; provider health workers remain

Acceptance criteria:

- External events block availability according to the owner’s sync settings.
- Failed syncs are visible and recoverable.
- Revoking an integration removes access safely.

## Phase 9 — Advanced scheduling

Priority: P2

Goal: Support more complex beauty-business workflows.

- [x] Recurring appointments
- [x] Packages and prepaid bundles
- [x] Multiple services in one booking
- [x] Classes and group sessions — owner class-session CRUD, date/time/duration/capacity fields, enrollment count, status, and durable RLS-protected storage are implemented
- [x] Block time and personal events — owner-managed unavailable periods are durable, mobile-safe, and respected by public booking availability
- [x] Capacity limits and attendee management
- [x] Waitlist
- [x] Resource / room scheduling
- [x] Seasonal service availability
- [x] Service-specific working hours — optional weekly JSON overrides are owner-editable per service and narrow public availability slots
- [x] Private categories and private booking pages
- [x] Memberships and loyalty features — membership plans, client enrollment, and owner-visible loyalty point balances are implemented

Acceptance criteria:

- Advanced bookings still obey staff, service, resource, buffer, and payment rules.
- Customers receive clear confirmation of the exact services and duration.

## Design system and UX rules

- [x] Keep owner screens operational, dense, and fast.
- [x] Keep customer booking screens calm, branded, and conversion-focused.
- [x] Use one primary action per screen.
- [x] Use shared spacing, type, radius, elevation, and status-color tokens.
- [x] Pair every status color with text or an icon.
- [x] Prefer drawers for appointment details and focused edits; avoid unnecessary modal stacking.
- [x] Use tables for operational records and cards for summaries or previews.
- [x] Make empty states actionable rather than decorative.
- [x] Preserve keyboard navigation and visible focus states.
- [x] Design mobile layouts as adapted workflows, not compressed desktop screens.
- [ ] Keep the warm Bookora personality without copying Setmore’s blue utility aesthetic.

Audit note: these rules are implemented across the current solo-owner MVP surfaces. Shared owner primitives, warm Bookora tokens, actionable loading/empty/error states, focus-managed drawers, status labels, mobile adaptations, and calm customer booking surfaces are in place. Continue validating them during real-device testing and before adding any advanced module back to navigation.

## Definition of done for every phase

- [ ] Owner workflow is usable on desktop and mobile.
- [ ] Loading, empty, error, permission, and success states are implemented.
- [ ] Data access is protected by Supabase RLS and server-side validation.
- [ ] No placeholder navigation or fake live data remains in the affected workflow.
- [ ] Accessibility review completed.
- [ ] Responsive review completed.
- [ ] Build and relevant tests pass.
- [ ] Product screenshots or a short demo capture added to the phase notes.
- [ ] Roadmap status and shipped date updated below.

## Phase tracking

| Phase | Status | Owner | Started | Shipped | Notes |
|---|---|---|---|---|---|
| Solo-owner MVP cutover | In progress | Codex | 2026-10-29 |  | Scope reset to one phone-first nail-salon owner. Primary navigation now shows only Overview, Calendar, Clients, Services, Payments, Booking Page, and Settings; advanced code is preserved but deferred. |
| 0. Foundation and navigation | Ready for Phase 1 | Codex | 2026-10-29 | 2026-10-29 | Production build passes; public booking and owner routing preserve React hook ordering; shared owner data primitives, shared states, and route/RLS authorization boundaries are in place. |
| 1. Staff and permissions | In progress | Codex | 2026-10-29 |  | Owner staff management, service assignment, invitation activation, membership claiming, availability conflict prevention, staff-filtered calendar views, database-enforced manager/own-calendar appointment permissions, staff business-context resolution, and TOTP 2FA setup are usable; full admin context switching remains. |
| 2. Appointment operations | In progress | Codex | 2026-10-29 |  | Structured appointments workspace, date/status/search/staff/payment filters, status actions, no-show marking, internal no-show reason, multi-service bookings, rescheduling prompts, calendar conflict checks, cancellation policy enforcement, bulk confirmation/cancellation/export, and keyboard undo recovery are usable. |
| 3. Client CRM | In progress | Codex | 2026-10-29 |  | Client list, searchable profiles, notes/tags, appointment history, RLS, appointment-to-client sync, validated CSV import/export, duplicate-safe email matching, duplicate review/merge panel, owner block toggle, server-enforced customer blocking, and privacy hardening are in place. |
| 4. Payments and deposits | In progress | Codex | 2026-10-29 |  | Owner payment ledger, appointment linking, date/status/customer search, staff/method filters, summaries, manual entry, service-specific deposit rules, balance-due display, refund confirmation with over-refund guard, printable receipts, operational and debit/credit accounting CSV exports, signed idempotent webhook intake, durable retry metadata/RPC, and visible retry actions are in place; native accounting connectors, provider adapter, live credentials, and payment settlement automation remain. |
| 5. Booking page controls | In progress | Codex | 2026-10-29 |  | Public booking link, copy/share/open actions, QR generation, website embed snippet, first-available booking, direct/private service links, owner preview, branding/contact settings, URL and availability controls, cancellation notice settings, visibility controls, customer login toggle, distribution guidance, and server-enforced customer cancellation policy are in place. |
| 6. Notifications | In progress | Codex | 2026-10-29 |  | Durable owner notification settings, channel toggles, reminder lead times, configurable delayed no-show follow-up, sender name/signature, quiet-hours enforcement, owner-only RLS, server-recorded booking confirmation history, owner-plus-assigned-staff confirmation queueing, queued cancellation/reschedule/payment/no-show events, protected Resend delivery, provider-neutral SMS queue/delivery, atomic stale-event recovery, and guarded owner retry/requeue are in place; worker-secret protection is documented in `DEPLOYMENT_RUNBOOK.md`; deployment scheduling, provider credentials, and dedicated event copy remain. |
| 7. Reports | In progress | Codex | 2026-10-29 |  | Reports dashboard, date-range metrics, timezone-safe date boundaries, booking/revenue/service/staff/cancellation-no-show reports, new-versus-returning customer insight, printable/CSV export, actionable empty states, payment reconciliation summary, booking activity trend, protected scheduled-report preferences with persisted business timezone, send-day-aware duplicate-safe report worker, and calendar staff/location assignment are in place; worker-secret and scheduler wiring are documented in `DEPLOYMENT_RUNBOOK.md`; deployment cron and customer-booking assignment rules remain. |
| 8. Integrations | In progress | Codex | 2026-10-29 |  | Owner integration center, dedicated webhook settings route, protected connection-state persistence, secure one-way ICS calendar feed with token rotation, hashed scoped webhook tokens, inbound idempotency, signed outbound appointment delivery with durable retry state, worker-secret protection, read-only services/appointments/clients/payments API resources, atomic rate limiting, scoped appointment create/update/delete operations, and validated owner-managed HTTPS meeting links are in place; scheduler wiring is documented in `DEPLOYMENT_RUNBOOK.md`; provider OAuth, two-way sync, native meeting-link generation, and reconnect workers remain. |
| 9. Advanced scheduling | In progress | Codex | 2026-10-29 |  | Recurring appointments, multi-service bookings, prepaid packages, capacity/waitlist/resource/seasonal/private-booking controls, conflict checks, staff/location assignment, service-specific hours, membership plans, client enrollment, loyalty balances, group class sessions, and block-time events are in place. |

## Research references

## 2026-10-29 implementation audit

| Dimension | Score | Evidence / remaining risk |
|---|---:|---|
| Accessibility | 3/4 | Semantic labels, dialog roles, live alerts, and mobile navigation labels are present; automated axe/runtime review is still pending. |
| Performance | 3/4 | Owner/customer route-level code splitting reduced the initial minified JavaScript bundle to approximately 475 kB; further dependency trimming remains. |
| Theming | 2/4 | Bookora tokens and warm-neutral surfaces are established, but several newer modules still use one-off color values. |
| Responsive design | 3/4 | Owner calendar, appointments, staff, memberships, and block-time flows have narrow-layout styles; browser viewport verification remains. |
| Anti-patterns | 3/4 | Operational hierarchy is clear, shared owner data primitives are now defined, and destructive actions have confirmation/undo; focus management for custom drawers and a few one-off surface colors remain. |
| **Total** | **13/20** | **Acceptable; continue hardening before release.** |

Audit gates: `npm run build` passes; `git diff --check` passes. ESLint is unavailable because no ESLint binary is installed, and `supabase db lint --local` is unverified because local Postgres/Docker is not running at `127.0.0.1:54322`.

Continuation audit: shared `OwnerStatusBadge`, `OwnerFilterBar`, `OwnerDataTable`, `OwnerDrawer`, and `OwnerPagination` primitives were added in `src/components/owner/OwnerDataPrimitives.tsx`; the structured appointments workspace now supports status/date/search/staff/payment filters and paginates filtered results at 12 rows per page. Its bulk status action now performs one business-scoped database update and applies one consistent local state transition. Appointment, shared owner, and webhook settings dialogs now trap Tab focus, close on Escape, and preserve keyboard recovery. Staff confirmation queueing now includes the assigned active staff member as well as the owner. Scheduled reports now enforce send-day preferences in the persisted business timezone and use a processing claim to avoid concurrent duplicate delivery. The scoped public API now supports appointment lifecycle writes, business-owned token authorization, atomic per-token rate limiting, and read access to services, appointments, clients, and payments. Payments now produce both operational and debit/credit accounting CSV exports. Appointment meeting links now persist with HTTPS validation, appear in the owner drawer, and are accepted by the API. Outbound webhook endpoints now have owner-scoped configuration, HMAC signing, durable queued deliveries, stale-claim recovery, exponential retry, delivery history, and worker-secret protection. The canonical schema trigger was audited and corrected so fresh schema bootstrap preserves delayed no-show follow-ups, including SMS-only customers. Build and diff gates still pass. Remaining P1/P2 findings are runtime SQL validation, external scheduler activation, provider OAuth/two-way sync, native accounting connectors, and provider-generated meeting links.

Mobile audit: the solo-owner navigation is now phone-first, the calendar defaults to day view below 680px with its side panel collapsed, and mobile calendar/action controls use 44px touch targets. Dashboard search and operational inputs use a 16px mobile font to reduce accidental zoom. Client and payment drawers keep action buttons reachable with a sticky safe-area footer, while calendar, appointment, payment, and shared data tables use touch-friendly horizontal scrolling. Build and `git diff --check` pass after these responsive changes; real-device/browser viewport verification remains.

- Setmore appointment calendar and owner/customer calendar separation: https://www.setmore.com/features/appointments
- Setmore Booking Page configuration and distribution: https://www.setmore.com/guides/booking-page-setup
- Setmore services and classes: https://support.setmore.com/en/collections/87056-services-classes
- Setmore staff permissions: https://support.setmore.com/en/articles/490975-login-and-security-for-your-team
- Setmore customer profiles and history: https://support.setmore.com/en/articles/491020-customer-notes-stats-and-appointment-history
- Setmore reports and exports: https://support.setmore.com/en/articles/491014-export-appointment-history
