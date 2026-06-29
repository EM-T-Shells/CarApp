#!/usr/bin/env node
/**
 * seed-e2e.mjs — deterministic test data for the Maestro E2E suite (carApp/e2e).
 *
 * Creates the two login accounts the flows sign in as, then seeds all the
 * UID-bound fixtures that hang off them. Everything is idempotent: auth users
 * are looked up by email before creation, and every data row uses a fixed
 * `e2e0…` UUID upserted on its primary key, so re-running converges rather
 * than duplicating.
 *
 *   Accounts
 *     test@carapp.dev      — customer
 *     provider@carapp.dev  — approved provider (founding, DETAILER)
 *
 *   Fixtures (keyed to the real auth UIDs)
 *     • customer vehicle (primary)
 *     • provider_profile (approved) + vetting set to approved + 2 service_packages
 *     • upcoming CONFIRMED booking scheduled today  → customer "Upcoming" + provider "My Jobs"
 *     • past COMPLETED booking (−10d) + 4 before/after photos + paid payment & payout
 *     • message thread on the upcoming booking + a few messages
 *
 * WHY a script and not pure SQL: public.users.id MUST equal auth.users.id
 * (RLS keys on auth.uid() = id), and auth users can only be created through
 * the Admin API with the service_role key — not via SQL.
 *
 * Requirements (in carApp/.env.local or the environment):
 *   EXPO_PUBLIC_SUPABASE_URL      (already present)
 *   SUPABASE_SERVICE_ROLE_KEY     (add this — service_role secret, NEVER EXPO_PUBLIC_)
 *
 * Run:  node scripts/seed-e2e.mjs        (or: npm run seed:e2e)
 *
 * NOTE: the service_role key bypasses RLS. This script is for test/staging
 * projects. Do not point it at production.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Minimal .env.local loader (no dotenv dependency) ────────────────────────
function loadEnvLocal() {
  const path = resolve(__dirname, '..', '.env.local')
  try {
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    /* .env.local optional — env may be provided directly */
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('✖ EXPO_PUBLIC_SUPABASE_URL is not set (carApp/.env.local).')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    '✖ SUPABASE_SERVICE_ROLE_KEY is not set.\n' +
      '  Add it to carApp/.env.local (gitignored) or the environment.\n' +
      '  Find it in: Supabase Dashboard → Project Settings → API → service_role.\n' +
      '  It bypasses RLS — never prefix it EXPO_PUBLIC_ and never commit it.',
  )
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Deterministic fixture IDs (valid UUIDs; "e2e0" marks them as seed data) ──
const ID = {
  providerProfile: 'e2e00000-0000-4000-8000-000000000001',
  vehicle: 'e2e00000-0000-4000-8000-000000000002',
  pkgFull: 'e2e00000-0000-4000-8000-000000000010',
  pkgExpress: 'e2e00000-0000-4000-8000-000000000011',
  bookingUpcoming: 'e2e00000-0000-4000-8000-000000000020',
  bookingPast: 'e2e00000-0000-4000-8000-000000000021',
  thread: 'e2e00000-0000-4000-8000-000000000030',
  msg1: 'e2e00000-0000-4000-8000-000000000040',
  msg2: 'e2e00000-0000-4000-8000-000000000041',
  msg3: 'e2e00000-0000-4000-8000-000000000042',
  photoB1: 'e2e00000-0000-4000-8000-000000000050',
  photoB2: 'e2e00000-0000-4000-8000-000000000051',
  photoA1: 'e2e00000-0000-4000-8000-000000000052',
  photoA2: 'e2e00000-0000-4000-8000-000000000053',
  payDeposit: 'e2e00000-0000-4000-8000-000000000060',
  payBalance: 'e2e00000-0000-4000-8000-000000000061',
  payout: 'e2e00000-0000-4000-8000-000000000070',
}

const CUSTOMER = { email: 'test@carapp.dev', full_name: 'Alex Customer' }
const PROVIDER = { email: 'provider@carapp.dev', full_name: 'Sam Provider' }

const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const DAY = 86_400_000

// ── Helpers ─────────────────────────────────────────────────────────────────
function die(label, error) {
  if (error) {
    console.error(`✖ ${label}:`, error.message ?? error)
    process.exit(1)
  }
}

/** Create the auth user if absent, else reuse it. Returns the auth UID. */
async function ensureAuthUser({ email, full_name }) {
  // listUsers is paginated; scan for the email. Test projects are small.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    die(`listUsers(${email})`, error)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) {
      console.log(`• auth user exists: ${email} (${hit.id})`)
      return hit.id
    }
    if (data.users.length < 200) break
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // confirmed so OTP sign-in just verifies the code
    user_metadata: { full_name, e2e: true },
  })
  die(`createUser(${email})`, error)
  console.log(`+ auth user created: ${email} (${data.user.id})`)
  return data.user.id
}

async function upsert(table, rows, onConflict = 'id') {
  const { error } = await admin.from(table).upsert(rows, { onConflict })
  die(`upsert ${table}`, error)
  console.log(`✓ ${table}: ${Array.isArray(rows) ? rows.length : 1} row(s)`)
}

async function lookupId(table, match) {
  const { data, error } = await admin.from(table).select('id').match(match).limit(1).maybeSingle()
  die(`lookup ${table}`, error)
  return data?.id ?? null
}

/** Find the auth UIDs for the two seed accounts (null if absent). */
async function findSeedAuthIds() {
  const out = {}
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    die('listUsers', error)
    for (const u of data.users) {
      if (u.email === CUSTOMER.email) out.customer = u.id
      if (u.email === PROVIDER.email) out.provider = u.id
    }
    if (data.users.length < 200) break
  }
  return out
}

// ── Clean (--clean) ──────────────────────────────────────────────────────────
// Removes every fixture this script creates: the e2e0… rows (reverse FK
// order) plus the two auth users. Idempotent — safe to run when nothing
// exists.
async function clean() {
  console.log(`\nCleaning E2E fixtures ← ${SUPABASE_URL}\n`)

  // Reverse dependency order. Most are covered by ON DELETE CASCADE from
  // bookings/profile/users, but we delete explicitly so the result is
  // deterministic regardless of FK actions.
  const byId = [
    ['messages', [ID.msg1, ID.msg2, ID.msg3]],
    ['message_threads', [ID.thread]],
    ['payouts', [ID.payout]],
    ['payments', [ID.payDeposit, ID.payBalance]],
    ['booking_photos', [ID.photoB1, ID.photoB2, ID.photoA1, ID.photoA2]],
    ['bookings', [ID.bookingUpcoming, ID.bookingPast]],
    ['service_packages', [ID.pkgFull, ID.pkgExpress]],
  ]
  for (const [table, ids] of byId) {
    const { error } = await admin.from(table).delete().in('id', ids)
    die(`delete ${table}`, error)
    console.log(`✓ ${table}`)
  }

  // provider_vetting keys on provider_id (auto-created by trigger).
  await admin.from('provider_vetting').delete().eq('provider_id', ID.providerProfile)
  await admin.from('provider_profiles').delete().eq('id', ID.providerProfile)
  await admin.from('vehicles').delete().eq('id', ID.vehicle)
  console.log('✓ provider_vetting / provider_profiles / vehicles')

  // public.users + auth users (by the live UIDs).
  const ids = await findSeedAuthIds()
  for (const uid of [ids.customer, ids.provider].filter(Boolean)) {
    await admin.from('users').delete().eq('id', uid)
    const { error } = await admin.auth.admin.deleteUser(uid)
    die(`deleteUser ${uid}`, error)
  }
  console.log('✓ users + auth users')
  console.log('\n✅ E2E clean complete.\n')
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding E2E fixtures → ${SUPABASE_URL}\n`)

  const customerId = await ensureAuthUser(CUSTOMER)
  const providerUserId = await ensureAuthUser(PROVIDER)

  // public.users rows MUST reuse the auth UIDs (RLS: auth.uid() = id).
  await upsert('users', [
    {
      id: customerId,
      email: CUSTOMER.email,
      full_name: CUSTOMER.full_name,
      role: 'customer',
      is_verified: true,
      email_verified: true,
      address_line1: '1600 Tysons Blvd',
      city: 'McLean',
      state: 'VA',
      postal_code: '22102',
    },
    {
      id: providerUserId,
      email: PROVIDER.email,
      full_name: PROVIDER.full_name,
      role: 'provider',
      is_verified: true,
      email_verified: true,
    },
  ])

  // Customer's primary vehicle.
  await upsert('vehicles', [
    {
      id: ID.vehicle,
      user_id: customerId,
      year: '2022',
      make: 'Honda',
      model: 'Civic',
      trim: 'EX-L',
      color: 'Silver',
      license_plate: 'E2E-1234',
      is_primary: true,
    },
  ])

  // Approved provider profile. Inserting the profile fires the
  // create_provider_vetting_row trigger (only on first insert).
  const detailerTypeId = await lookupId('provider_types', { name: 'DETAILER' })
  await upsert('provider_profiles', [
    {
      id: ID.providerProfile,
      user_id: providerUserId,
      provider_type_id: detailerTypeId,
      bio: 'E2E demo detailer — mobile interior & exterior detailing across NoVA.',
      coverage_area: 'McLean / Tysons / Vienna, VA',
      mile_radius: 20,
      availability: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
      avg_gear_rating: 4.8,
      total_jobs: 42,
      kudos_count: 17,
      stripe_account_id: 'acct_e2e_demo', // non-null so payout isn't "blocked"
      verification_status: 'approved',
      platform_fee_rate: 0.0, // founding provider
      is_founding_provider: true,
      approved_at: iso(now - 30 * DAY),
    },
  ])

  // Flip the auto-created vetting row to fully approved (UPDATE, not insert —
  // the trigger already created it).
  {
    const { error } = await admin
      .from('provider_vetting')
      .update({
        identity_status: 'approved',
        background_status: 'approved',
        insurance_status: 'approved',
        credentials_status: 'approved',
        bank_status: 'approved',
        profile_completeness: 100,
        reviewed_at: iso(now - 30 * DAY),
      })
      .eq('provider_id', ID.providerProfile)
    die('update provider_vetting', error)
    console.log('✓ provider_vetting: approved')
  }

  // Two published service packages (catalog_id optional — null if catalog unseeded).
  const fullDetailCat = await lookupId('service_catalog', { name: 'Full Detail' })
  const expressCat = await lookupId('service_catalog', { name: 'Express Wash' })
  await upsert('service_packages', [
    {
      id: ID.pkgFull,
      provider_id: ID.providerProfile,
      catalog_id: fullDetailCat,
      name: 'Full Detail',
      description: 'Complete interior + exterior detail. ~3 hours.',
      category: 'detailing',
      base_price: 150.0,
      duration_mins: 180,
      is_active: true,
      is_approved: true,
      sort_order: 0,
    },
    {
      id: ID.pkgExpress,
      provider_id: ID.providerProfile,
      catalog_id: expressCat,
      name: 'Express Wash',
      description: 'Quick exterior wash & dry. ~45 minutes.',
      category: 'detailing',
      base_price: 49.0,
      duration_mins: 45,
      is_active: true,
      is_approved: true,
      sort_order: 1,
    },
  ])

  // services JSONB snapshot — shape must match ServiceSnapshot
  // (id, name, description, category, base_price, duration_mins).
  const fullDetailSnapshot = [
    {
      id: ID.pkgFull,
      name: 'Full Detail',
      description: 'Complete interior + exterior detail. ~3 hours.',
      category: 'detailing',
      base_price: 150.0,
      duration_mins: 180,
    },
  ]

  const money = {
    total_amount: 150.0,
    deposit_amount: 22.5, // 15%
    platform_fee: 0.0, // founding provider
    service_fee: 3.0, // customer 2%
    provider_payout: 150.0,
  }

  // Upcoming CONFIRMED booking scheduled today → shows in the customer's
  // Upcoming list AND the provider's My Jobs (and enables "Start Travel").
  await upsert('bookings', [
    {
      id: ID.bookingUpcoming,
      customer_id: customerId,
      provider_id: ID.providerProfile,
      vehicle_id: ID.vehicle,
      package_id: ID.pkgFull,
      services: fullDetailSnapshot,
      status: 'confirmed',
      ...money,
      service_address: '1600 Tysons Blvd, McLean, VA 22102',
      location_lat: 38.9187,
      location_lng: -77.2311,
      notes: 'Gate code 4242. Park in the driveway.',
      scheduled_at: iso(now + 4 * 3600_000), // today, +4h
    },
    // Past COMPLETED booking → receipt, Book Again, earnings, payout.
    {
      id: ID.bookingPast,
      customer_id: customerId,
      provider_id: ID.providerProfile,
      vehicle_id: ID.vehicle,
      package_id: ID.pkgFull,
      services: fullDetailSnapshot,
      status: 'completed',
      ...money,
      service_address: '1600 Tysons Blvd, McLean, VA 22102',
      location_lat: 38.9187,
      location_lng: -77.2311,
      scheduled_at: iso(now - 10 * DAY),
      started_at: iso(now - 10 * DAY + 3600_000),
      completed_at: iso(now - 10 * DAY + 4 * 3600_000),
    },
  ])

  // 4 before/after photos on the completed booking (satisfies the gallery).
  const ph = (id, type, n) => ({
    id,
    booking_id: ID.bookingPast,
    photo_type: type,
    storage_url: `https://picsum.photos/seed/e2e-${type}-${n}/800/600`,
  })
  await upsert('booking_photos', [
    ph(ID.photoB1, 'before', 1),
    ph(ID.photoB2, 'before', 2),
    ph(ID.photoA1, 'after', 1),
    ph(ID.photoA2, 'after', 2),
  ])

  // Payments (deposit + balance) and a paid payout on the completed booking.
  await upsert('payments', [
    {
      id: ID.payDeposit,
      booking_id: ID.bookingPast,
      user_id: customerId,
      stripe_payment_intent_id: 'pi_e2e_deposit',
      payment_type: 'deposit',
      amount: 22.5,
      status: 'succeeded',
    },
    {
      id: ID.payBalance,
      booking_id: ID.bookingPast,
      user_id: customerId,
      stripe_payment_intent_id: 'pi_e2e_balance',
      payment_type: 'balance',
      amount: 127.5,
      status: 'succeeded',
    },
  ])
  await upsert('payouts', [
    {
      id: ID.payout,
      provider_id: ID.providerProfile,
      booking_id: ID.bookingPast,
      stripe_transfer_id: 'tr_e2e_payout',
      amount: 150.0,
      status: 'paid',
      paid_at: iso(now - 9 * DAY),
    },
  ])

  // Message thread on the upcoming booking + a few messages (Workflow C).
  await upsert('message_threads', [
    {
      id: ID.thread,
      booking_id: ID.bookingUpcoming,
      customer_id: customerId,
      provider_id: ID.providerProfile,
    },
  ])
  await upsert('messages', [
    {
      id: ID.msg1,
      thread_id: ID.thread,
      sender_id: providerUserId,
      body: "Hi! Confirming I'll be there today around your scheduled time.",
      is_read: true,
      sent_at: iso(now - 2 * 3600_000),
    },
    {
      id: ID.msg2,
      thread_id: ID.thread,
      sender_id: customerId,
      body: 'Great, thank you! The car is in the driveway.',
      is_read: true,
      sent_at: iso(now - 1.5 * 3600_000),
    },
    {
      id: ID.msg3,
      thread_id: ID.thread,
      sender_id: providerUserId,
      body: 'Perfect — see you soon.',
      is_read: false,
      sent_at: iso(now - 1 * 3600_000),
    },
  ])

  console.log('\n✅ E2E seed complete.\n')
  console.log('Login accounts (configure a fixed test OTP for these in the')
  console.log('Supabase dashboard so the auth flow can enter a known code):')
  console.log(`   customer: ${CUSTOMER.email}`)
  console.log(`   provider: ${PROVIDER.email}`)
  console.log('\nSee carApp/e2e/SEEDING.md for the test-OTP step.\n')
}

const run = process.argv.includes('--clean') ? clean : main
run().catch((e) => {
  console.error('✖ failed:', e)
  process.exit(1)
})
