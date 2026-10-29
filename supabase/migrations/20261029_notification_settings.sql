-- Phase 6: durable owner notification preferences.
create table if not exists public.notification_settings (
    business_id uuid references auth.users(id) on delete cascade primary key,
    email_enabled boolean not null default true,
    sms_enabled boolean not null default false,
    customer_confirmation_enabled boolean not null default true,
    staff_confirmation_enabled boolean not null default true,
    reminder_enabled boolean not null default true,
    reminder_lead_hours integer not null default 24,
    sender_name text not null default 'Bookora',
    email_signature text not null default '',
    quiet_hours_start time,
    quiet_hours_end time,
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    constraint notification_settings_reminder_lead_hours_check check (reminder_lead_hours in (2, 24, 48, 72)),
    constraint notification_settings_sender_name_check check (char_length(sender_name) between 1 and 80),
    constraint notification_settings_email_signature_check check (char_length(email_signature) <= 1000)
);

alter table public.notification_settings enable row level security;

drop policy if exists "Owners can view notification settings" on public.notification_settings;
create policy "Owners can view notification settings"
    on public.notification_settings for select using (auth.uid() = business_id);

drop policy if exists "Owners can insert notification settings" on public.notification_settings;
create policy "Owners can insert notification settings"
    on public.notification_settings for insert with check (auth.uid() = business_id);

drop policy if exists "Owners can update notification settings" on public.notification_settings;
create policy "Owners can update notification settings"
    on public.notification_settings for update using (auth.uid() = business_id) with check (auth.uid() = business_id);

grant select, insert, update on public.notification_settings to authenticated;
