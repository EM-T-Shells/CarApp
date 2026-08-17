-- Storage buckets + RLS (Image & File Upload spec).
--
-- Before: no storage buckets existed in the project, so every upload path
-- (avatar, booking photo, vetting document) failed at runtime with
-- "Bucket not found". The app code in src/lib/supabase/storage.ts targets three
-- buckets by name but nothing ever created them.
--
-- Now: creates the three buckets and their storage.objects RLS policies to match
-- the documented access model:
--   * avatars           — public bucket. Anyone can read; a user may write only
--                         their own `{userId}.{ext}` object.
--   * booking-photos     — private. Only the booking's customer or the booking's
--                         provider (via provider_profiles.user_id) may read/write
--                         objects under `{bookingId}/...`.
--   * vetting-documents — private. A provider may INSERT only under their own
--                         `{userId}/...` folder. No SELECT policy is granted, so
--                         reads are service-role only (admin-review-provider
--                         Edge Function), per the vetting security model.
--
-- All uploads are additionally constrained to image mime types (jpeg/png/webp)
-- and 10 MB at the bucket level, mirroring validateFile() in storage.ts.
--
-- Idempotent — safe to re-run. Apply with: supabase db push  (or SQL editor).

-- ── Buckets ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',           'avatars',           true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('booking-photos',    'booking-photos',    false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('vetting-documents', 'vetting-documents', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── avatars (public read, owner write) ───────────────────────────────────
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner insert" on storage.objects;
create policy "avatars: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '.%'
  );

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '.%'
  )
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '.%'
  );

-- ── booking-photos (participants only) ───────────────────────────────────
-- The first path segment is the booking id. A user is a participant if they are
-- the booking's customer, or the user behind the booking's provider_profile.
drop policy if exists "booking-photos: participant read" on storage.objects;
create policy "booking-photos: participant read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-photos'
    and exists (
      select 1
      from public.bookings b
      left join public.provider_profiles p on p.id = b.provider_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.customer_id = auth.uid() or p.user_id = auth.uid())
    )
  );

drop policy if exists "booking-photos: participant insert" on storage.objects;
create policy "booking-photos: participant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-photos'
    and exists (
      select 1
      from public.bookings b
      left join public.provider_profiles p on p.id = b.provider_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.customer_id = auth.uid() or p.user_id = auth.uid())
    )
  );

-- ── vetting-documents (owner insert only; reads are service-role only) ────
drop policy if exists "vetting-documents: owner insert" on storage.objects;
create policy "vetting-documents: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vetting-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
