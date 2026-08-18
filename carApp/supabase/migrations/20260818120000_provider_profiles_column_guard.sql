-- Close the provider_profiles write hole — the third of the same shape, after
-- 20260817120000 (bookings UPDATE) and 20260817140000 (bookings INSERT).
--
-- "provider_profiles: write own" is FOR ALL USING (auth.uid() = user_id) with
-- no column restriction. The row predicate is correct and always was: FOR ALL
-- with no WITH CHECK reuses USING as the check, so a provider can only ever
-- touch their own row. The missing piece is that RLS has no column-level
-- granularity at all — it can say *which rows*, never *which columns* — so
-- "your own row" has meant every column on it.
--
-- Confirmed against the live project as the seeded provider, using the anon key
-- that ships inside the mobile binary:
--
--   original platform_fee_rate: 0
--     write accepted; value is now 0.999
--
-- What that reaches:
--   platform_fee_rate            set it to 0 and the platform's cut disappears.
--                                The same quiet exploit as the bookings INSERT
--                                hole, one table over: nobody is underpaid, so
--                                nobody has a reason to look.
--   verification_status          a 'pending' provider can write 'approved',
--                                bypassing all six vetting steps and becoming
--                                bookable. It also re-fires the Founding
--                                Provider enrollment trigger (20260622140000).
--   is_founding_provider,        fee tier and its expiry, self-assigned.
--   founding_provider_expires_at
--   stripe_account_id            payout routing. Only the Connect Edge Function
--                                has any business writing this.
--   total_jobs, avg_gear_rating, reputation, self-assigned. These drive search
--   kudos_count                  ranking.
--   approved_at                  vetting audit trail.
--
-- Fix: the same column allowlist the bookings tables now carry. Postgres checks
-- column privileges independently of RLS, so a future policy bug cannot reopen
-- this. The policy itself is left alone — it was never the problem.
--
-- The allowlist is what the app actually writes, verified by reading every
-- caller of insertProviderProfile/updateProviderProfile:
--   app/(tabs)/more/provider.tsx    insert { user_id, provider_type_id }
--   app/(provider)/vetting.tsx      insert { user_id }
--   src/state/signUpSubmit.ts       insert { user_id }
--   app/(provider)/profile.tsx      update { bio, coverage_area, mile_radius,
--                                            availability, base_lat, base_lng }
--   app/(provider-tabs)/more/manage.tsx
--                                   update { bio, coverage_area, mile_radius,
--                                            availability }
-- plus default_buffer_before_mins / default_buffer_after_mins from
-- 20260818000000, whose More -> Manage control is not built yet.
--
-- Idempotent — safe to re-run.

-- ── Column allowlist ─────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.provider_profiles FROM anon, authenticated;

-- `id` is granted for the same reason it is on bookings: it is not sensitive,
-- the policy still governs the row, and withholding it costs a misleading
-- "permission denied for table provider_profiles" because Postgres reports
-- INSERT column denials at table level.
GRANT INSERT (
  id,
  user_id,
  provider_type_id
) ON public.provider_profiles TO authenticated;

-- provider_type_id is deliberately INSERT-only. It is chosen at opt-in and
-- nothing in the app changes it afterwards; switching type post-approval should
-- re-enter vetting rather than being a profile edit, since the six steps are
-- type-specific.
GRANT UPDATE (
  bio,
  coverage_area,
  mile_radius,
  base_lat,
  base_lng,
  availability,
  default_buffer_before_mins,
  default_buffer_after_mins
) ON public.provider_profiles TO authenticated;

-- DELETE is revoked with nothing granted back. No mutation in the app deletes a
-- provider profile, and the row is the FK target for bookings (ON DELETE SET
-- NULL), payouts and service packages — a self-delete would quietly orphan a
-- provider's job history. Account deletion belongs to the service role.

COMMENT ON TABLE public.provider_profiles IS
  'Provider profile. The client may write only the presentation and scheduling-preference columns (see the GRANTs in 20260818120000): fee rate, verification status, founding-provider fields, Stripe account and reputation counters are service-role only.';
