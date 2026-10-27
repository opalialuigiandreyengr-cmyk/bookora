-- Let an authenticated customer view only the attachment paths belonging to
-- appointments made with the email on their signed-in account.
drop policy if exists "Customers can view own booking attachments" on storage.objects;
create policy "Customers can view own booking attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'booking-attachments'
  and exists (
    select 1
    from public.appointments appointment
    where (appointment.peg_image_path = name or appointment.payment_receipt_path = name)
      and lower(trim(appointment.customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);
