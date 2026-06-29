-- Trigger/sweep verification for migration 20260622140000_founding_provider_program.
--
-- Pure-SQL behavioral test for the Founding Provider Program (Blocker #8). The
-- whole thing runs inside a transaction and ROLLBACKs, so it never mutates real
-- data. Results are collected into a temp table and SELECTed at the end.
--
-- Run against the linked project (read-write path, no psql required):
--   supabase db query --linked -f supabase/migrations/__tests__/founding_provider_program.test.sql
--
-- Each row's `note` states the expectation; compare `founding` / `fee` against it.
-- Expected:
--   1_pending_insert       founding=false fee=0.030   (pending is never founding)
--   2_approve_under_cap    founding=true  fee=0.000    (enrolled, ~90d expiry)
--   3_reapprove_idempotent (no error)                  (re-approve doesn't re-enroll)
--   4_over_cap_approve     founding=false fee=0.030    (101st+ provider gets 3%)
--   5_expiry_sweep         founding=true  fee=0.030    (window over → 3%, badge kept)

BEGIN;
CREATE TEMP TABLE _results (step TEXT, founding BOOLEAN, fee NUMERIC, note TEXT) ON COMMIT DROP;
DO $$
DECLARE uid UUID; new_id UUID; rec RECORD; cnt INT; expired INT;
BEGIN
  SELECT id INTO uid FROM users LIMIT 1;

  -- 1. A pending provider is never founding.
  INSERT INTO provider_profiles (user_id, verification_status, platform_fee_rate)
    VALUES (uid,'pending',0.030) RETURNING id INTO new_id;
  SELECT is_founding_provider f, platform_fee_rate p INTO rec FROM provider_profiles WHERE id=new_id;
  INSERT INTO _results VALUES ('1_pending_insert', rec.f, rec.p, 'expect founding=false, fee=0.030');

  -- 2. Approving under the cap enrolls: founding, 0%, ~90-day expiry.
  UPDATE provider_profiles SET verification_status='approved', approved_at=now() WHERE id=new_id;
  SELECT is_founding_provider f, platform_fee_rate p,
         (founding_provider_expires_at::date - now()::date) d INTO rec FROM provider_profiles WHERE id=new_id;
  INSERT INTO _results VALUES ('2_approve_under_cap', rec.f, rec.p, 'expect founding=true, fee=0, days='||rec.d||' (~90)');

  -- 3. Re-approving an already-approved/founding provider is a no-op (idempotent).
  UPDATE provider_profiles SET verification_status='approved' WHERE id=new_id;
  INSERT INTO _results VALUES ('3_reapprove_idempotent', NULL, NULL, 'no error raised = pass');

  -- 4. Once 100 founding exist, the next approval is NOT founding (standard 3%).
  WITH to_flip AS (SELECT id FROM provider_profiles WHERE is_founding_provider IS NOT TRUE)
    UPDATE provider_profiles p SET is_founding_provider=TRUE FROM to_flip t WHERE p.id=t.id;
  SELECT count(*) INTO cnt FROM provider_profiles WHERE is_founding_provider IS TRUE;
  WHILE cnt < 100 LOOP
    INSERT INTO provider_profiles (user_id, verification_status, is_founding_provider, platform_fee_rate)
      VALUES (uid,'approved',TRUE,0.000);
    cnt := cnt + 1;
  END LOOP;
  INSERT INTO provider_profiles (user_id, verification_status, approved_at, platform_fee_rate)
    VALUES (uid,'approved',now(),0.030) RETURNING id INTO new_id;
  SELECT is_founding_provider f, platform_fee_rate p INTO rec FROM provider_profiles WHERE id=new_id;
  INSERT INTO _results VALUES ('4_over_cap_approve', rec.f, rec.p, 'expect founding=false, fee=0.030');

  -- 5. The expiry sweep converts an elapsed window to 3% but keeps the badge.
  INSERT INTO provider_profiles (user_id, verification_status, is_founding_provider, platform_fee_rate, founding_provider_expires_at)
    VALUES (uid,'approved',TRUE,0.000, now()-INTERVAL '1 day') RETURNING id INTO new_id;
  SELECT public.expire_founding_providers() INTO expired;
  SELECT is_founding_provider f, platform_fee_rate p, founding_provider_expires_at IS NULL nullexp INTO rec FROM provider_profiles WHERE id=new_id;
  INSERT INTO _results VALUES ('5_expiry_sweep', rec.f, rec.p, 'converted='||expired||', founding stays true, fee->0.030, expiry null='||rec.nullexp);
END $$;
SELECT * FROM _results ORDER BY step;
ROLLBACK;
