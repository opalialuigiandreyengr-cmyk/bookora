-- New customer booking requests require owner approval before confirmation.
alter table public.appointments
  alter column status set default 'pending';
