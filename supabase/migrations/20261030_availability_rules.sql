alter table public.business_profiles
  add column if not exists availability_breaks jsonb not null default '{}'::jsonb,
  add column if not exists time_off jsonb not null default '[]'::jsonb;

comment on column public.business_profiles.availability_breaks is 'Recurring break windows keyed by weekday name.';
comment on column public.business_profiles.time_off is 'One-off and recurring unavailable date windows.';
