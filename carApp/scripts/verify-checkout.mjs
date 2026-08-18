#!/usr/bin/env node
/**
 * verify-checkout.mjs — proves the client's booking insert survives the
 * server-side pricing layer added in 20260817140000.
 *
 * WHY THIS EXISTS
 *
 * Every Jest test in this repo mocks Supabase, and there is no test at all for
 * app/(tabs)/search/book/[providerId].tsx. The .test.sql files prove the
 * *database* prices correctly; they do not prove the *client* sends a payload
 * the database accepts. Those are different claims, and the seam between them
 * is exactly what commit 2cf778b rewrote.
 *
 * This script closes that seam by impersonating the app: it authenticates with
 * the ANON key as the seeded customer and fires the exact payload
 * handleConfirm() sends, then asserts the row comes back correctly priced.
 *
 * The anon key is the whole point. derive_booking_amounts() early-returns for
 * any role outside ('authenticated','anon'), and the INSERT column grants only
 * bind `authenticated`. A service_role script would bypass both layers and
 * prove nothing. The service_role key is used for exactly two things here:
 * minting a session (the seeded accounts are OTP-only and have no password)
 * and deleting the rows this script creates.
 *
 * COVERS   client payload → column privileges → trigger → returned row,
 *          the forged-price rejections, and the abandon path
 *          (pending → cancelled) against enforce_booking_status_transition.
 * DOES NOT COVER   Stripe. No create_deposit_intent, no PaymentSheet, no
 *          stripe-events promotion to pending_provider_approval. Those need a
 *          simulator run — see Blueprint/quote_first_booking_handoff.md §4.
 *
 * Requirements (carApp/.env.local or the environment):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_KEY        (anon — the key that ships in the binary)
 *   SUPABASE_SERVICE_ROLE_KEY       (sign-in + cleanup only, never the insert)
 *
 * Fixtures come from scripts/seed-e2e.mjs. Run that first if this reports
 * missing seed data.
 *
 * Run:  node scripts/verify-checkout.mjs        (or: npm run verify:checkout)
 *       node scripts/verify-checkout.mjs --keep  leaves rows behind to inspect
 *
 * NOTE: creates and deletes real booking rows. Test/staging projects only.
 */

// Must come before any network client is constructed. See the file header for
// why Node's fetch cannot reach IPv4-only hosts on WSL2 without it.
import './lib/ipv4-dns.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEEP_ROWS = process.argv.includes('--keep')

// ── Minimal .env.local loader (mirrors seed-e2e.mjs; no dotenv dependency) ──
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
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

for (const [name, val] of [
  ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['EXPO_PUBLIC_SUPABASE_KEY', ANON_KEY],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
]) {
  if (!val) {
    console.error(`✖ ${name} is not set (carApp/.env.local).`)
    process.exit(1)
  }
}

// ── Seeded fixture ids (must match scripts/seed-e2e.mjs) ───────────────────
const ID = {
  providerProfile: 'e2e00000-0000-4000-8000-000000000001',
  vehicle: 'e2e00000-0000-4000-8000-000000000002',
  pkgFull: 'e2e00000-0000-4000-8000-000000000010',
  pkgExpress: 'e2e00000-0000-4000-8000-000000000011',
}
const CUSTOMER_EMAIL = 'test@carapp.dev'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// The client under test. Same key the mobile binary ships with.
const app = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// ── Money math ─────────────────────────────────────────────────────────────
// Mirrors src/utils/money.ts, which is the contract the review screen shows
// the customer, and derive_booking_amounts(), which is what actually gets
// charged. The two agreeing is the headline assertion of this script.
//
// One deliberate asymmetry: platform_fee/provider_payout derive from the
// SUBTOTAL, matching the trigger. money.ts's calculatePlatformFee takes a
// total, but nothing customer-facing calls it during checkout — the trigger is
// authoritative for what lands on the row.
const toCents = (dollars) => Math.round(Number(dollars ?? 0) * 100)
const serviceFeeCents = (subtotal) => Math.floor(subtotal * 0.02)
const depositCents = (total) => Math.floor(total * 0.15)

function priceLocally(packages, feeRate) {
  const subtotal = packages.reduce((sum, p) => sum + toCents(p.base_price), 0)
  const fee = serviceFeeCents(subtotal)
  const total = subtotal + fee
  const platformFee = Math.floor(subtotal * feeRate)
  return {
    subtotal,
    service_fee: fee,
    total_amount: total,
    deposit_amount: depositCents(total),
    platform_fee: platformFee,
    provider_payout: subtotal - platformFee,
    estimated_duration_mins: packages.reduce((sum, p) => sum + (p.duration_mins ?? 0), 0),
  }
}

// ── Check harness ──────────────────────────────────────────────────────────
const results = []
const createdBookingIds = []

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, pass: true, detail })
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (err) {
    results.push({ name, pass: false, detail: err.message })
    console.log(`  ✖ ${name}\n      ${err.message}`)
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

function assertEqualCents(actual, expected, label) {
  const a = toCents(actual)
  assert(
    a === expected,
    `${label}: expected ${expected}¢ ($${(expected / 100).toFixed(2)}), got ${a}¢ ($${(a / 100).toFixed(2)})`,
  )
}

/** Postgres error code off a PostgREST error, which nests it inconsistently. */
function errCode(error) {
  return error?.code ?? ''
}

// ── Sign in as the seeded customer ─────────────────────────────────────────
// The seeded accounts are created with email_confirm and NO password (the app
// signs in via OTP), so signInWithPassword is not an option. generateLink mints
// a token_hash the anon client can redeem into a real session — the admin key
// opens the door and then plays no further part.
async function signInAsCustomer() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: CUSTOMER_EMAIL,
  })
  if (error) {
    throw new Error(
      `generateLink(${CUSTOMER_EMAIL}) failed: ${error.message}\n` +
        '  Run `npm run seed:e2e` first — the customer account must exist.',
    )
  }

  const tokenHash = data?.properties?.hashed_token
  assert(tokenHash, 'generateLink returned no hashed_token')

  // 'magiclink' is the precise type; 'email' is the generic alias. Older
  // gotrue builds accept only one, so try both before giving up.
  let session = null
  for (const type of ['magiclink', 'email']) {
    const { data: verified, error: verifyError } = await app.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })
    if (!verifyError && verified?.session) {
      session = verified.session
      break
    }
  }
  assert(session, 'verifyOtp did not return a session for the seeded customer')

  const { data: userData } = await app.auth.getUser()
  assert(userData?.user?.id, 'anon client has no authenticated user after verifyOtp')
  return userData.user.id
}

// ── The payload under test ─────────────────────────────────────────────────
// Byte-for-byte the shape handleConfirm() sends in
// app/(tabs)/search/book/[providerId].tsx. If that screen's payload changes,
// change it here too — a divergence is precisely the bug this script exists to
// catch, so do not "fix" a failure by loosening this.
function clientPayload(customerId, packageIds, overrides = {}) {
  return {
    customer_id: customerId,
    provider_id: ID.providerProfile,
    vehicle_id: ID.vehicle,
    services: packageIds.map((id) => ({ id })),
    status: 'pending',
    service_address: '1600 Tysons Blvd, McLean, VA 22102',
    location_lat: 38.9243,
    location_lng: -77.2247,
    notes: 'verify-checkout.mjs',
    scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

async function insertAsClient(payload) {
  const result = await app.from('bookings').insert(payload).select().single()
  if (result.data?.id) createdBookingIds.push(result.data.id)
  return result
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nverify-checkout — ${SUPABASE_URL}\n`)

  const customerId = await signInAsCustomer()
  console.log(`signed in as ${CUSTOMER_EMAIL} (${customerId}) with the anon key\n`)

  // ── Preflight: the fixtures the checks depend on, read through RLS as the
  // customer. If any of this fails the seed is the problem, not the code.
  console.log('preflight')

  const { data: packages, error: pkgError } = await app
    .from('service_packages')
    .select('id, name, base_price, duration_mins, is_active, is_approved')
    .eq('provider_id', ID.providerProfile)
    .in('id', [ID.pkgFull, ID.pkgExpress])

  await check('seeded packages are visible to the customer through RLS', () => {
    assert(!pkgError, `read failed: ${pkgError?.message}`)
    assert(
      packages?.length === 2,
      `expected 2 packages, got ${packages?.length ?? 0}. ` +
        'An is_active/is_approved false package is hidden by RLS and will fail the insert, not price to zero.',
    )
    return packages.map((p) => `${p.name} $${p.base_price}`).join(', ')
  })

  if (packages?.length !== 2) {
    console.error('\n✖ Seed fixtures missing. Run `npm run seed:e2e` and retry.\n')
    process.exit(1)
  }

  const { data: vehicle } = await app
    .from('vehicles')
    .select('id')
    .eq('id', ID.vehicle)
    .maybeSingle()

  await check('seeded vehicle is visible to the customer', () => {
    assert(vehicle?.id === ID.vehicle, 'vehicle fixture missing — run `npm run seed:e2e`')
  })

  const { data: providerProfile } = await app
    .from('provider_profiles')
    .select('id, platform_fee_rate, verification_status')
    .eq('id', ID.providerProfile)
    .maybeSingle()

  await check('provider profile readable, fee rate known', () => {
    assert(providerProfile?.id, 'provider profile fixture missing — run `npm run seed:e2e`')
    return `platform_fee_rate = ${providerProfile.platform_fee_rate} (founding trigger sets 0% for the first 100 approved)`
  })

  // COALESCE(pp.platform_fee_rate, 0.03) — same default the trigger applies.
  const feeRate = Number(providerProfile?.platform_fee_rate ?? 0.03)
  const both = packages.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
  const expected = priceLocally(both, feeRate)

  // ── The happy path ───────────────────────────────────────────────────────
  console.log('\nhappy path — the exact payload the booking screen sends')

  const { data: booking, error: bookingError } = await insertAsClient(
    clientPayload(customerId, both.map((p) => p.id)),
  )

  await check('insert is accepted (no column-privilege rejection)', () => {
    assert(
      !bookingError,
      `insert failed: [${errCode(bookingError)}] ${bookingError?.message}\n` +
        '      Postgres reports INSERT column denials at TABLE level, so one ungranted\n' +
        '      column reads as a blanket "permission denied for table bookings".\n' +
        '      Compare the payload above against the GRANT list in migration 20260817140000.',
    )
    return `booking ${booking.id}`
  })

  if (bookingError) {
    await finish()
    return
  }

  await check('total_amount priced server-side', () => {
    assertEqualCents(booking.total_amount, expected.total_amount, 'total_amount')
  })

  await check('service_fee priced server-side (2% of subtotal, floored)', () => {
    assertEqualCents(booking.service_fee, expected.service_fee, 'service_fee')
  })

  await check('platform_fee priced server-side', () => {
    assertEqualCents(booking.platform_fee, expected.platform_fee, 'platform_fee')
  })

  await check('provider_payout priced server-side', () => {
    assertEqualCents(booking.provider_payout, expected.provider_payout, 'provider_payout')
  })

  // The headline: the review screen renders `Pay ${centsToDisplay(deposit)}
  // Deposit` from the local draft, but the Edge Function charges
  // booking.deposit_amount off the row. These disagreeing means the customer is
  // shown one number and charged another.
  await check('deposit shown on the review screen == deposit stored on the row', () => {
    assertEqualCents(booking.deposit_amount, expected.deposit_amount, 'deposit_amount')
    return `$${(expected.deposit_amount / 100).toFixed(2)}`
  })

  // handleConfirm reads `booking.deposit_amount ?? 0`. A null or absent column
  // silently becomes a $0 intent instead of an error, so assert it landed.
  await check('deposit_amount round-trips non-zero through .select()', () => {
    assert(
      booking.deposit_amount !== null && booking.deposit_amount !== undefined,
      'deposit_amount came back null — the `?? 0` fallback in handleConfirm would mask this as a $0 intent',
    )
    assert(toCents(booking.deposit_amount) > 0, 'deposit_amount is zero')
  })

  await check('estimated_duration_mins derived from the same rows (Phase 0)', () => {
    assert(
      booking.estimated_duration_mins === expected.estimated_duration_mins,
      `expected ${expected.estimated_duration_mins}, got ${booking.estimated_duration_mins}`,
    )
    return `${expected.estimated_duration_mins} min`
  })

  await check('estimated_completion_at generated from scheduled_at + duration', () => {
    assert(booking.estimated_completion_at, 'estimated_completion_at is null')
    const delta =
      (new Date(booking.estimated_completion_at) - new Date(booking.scheduled_at)) / 60000
    assert(
      Math.round(delta) === expected.estimated_duration_mins,
      `expected +${expected.estimated_duration_mins} min, got +${Math.round(delta)}`,
    )
  })

  await check('services snapshot rebuilt by the trigger, not echoed back', () => {
    const snap = booking.services
    assert(Array.isArray(snap) && snap.length === 2, `expected 2 snapshot entries, got ${snap?.length}`)
    for (const entry of snap) {
      assert(entry.name, 'snapshot entry has no name — the client sent only {id}, so this proves the rebuild')
      assert(entry.category !== undefined, 'snapshot entry has no category')
      const source = both.find((p) => p.id === entry.id)
      assert(source, `snapshot contains unknown package ${entry.id}`)
      assert(
        entry.base_price === toCents(source.base_price),
        `snapshot base_price for ${entry.name}: expected ${toCents(source.base_price)}¢ (cents), got ${entry.base_price}`,
      )
    }
  })

  await check('status opens at pending', () => {
    assert(booking.status === 'pending', `expected 'pending', got '${booking.status}'`)
  })

  // ── Rejections ───────────────────────────────────────────────────────────
  console.log('\nrejections — what the client must no longer be able to say')

  await check('stating a price is refused at the column-privilege layer', async () => {
    const { error } = await insertAsClient(
      clientPayload(customerId, [ID.pkgFull], { total_amount: 1.0 }),
    )
    assert(error, 'insert with total_amount succeeded — the INSERT grant list is too wide')
    assert(
      errCode(error) === '42501' || /permission denied/i.test(error.message),
      `expected 42501 permission denied, got [${errCode(error)}] ${error.message}`,
    )
    return `[${errCode(error)}]`
  })

  await check('zeroing the platform fee is refused', async () => {
    const { error } = await insertAsClient(
      clientPayload(customerId, [ID.pkgFull], { platform_fee: 0, provider_payout: 150 }),
    )
    assert(error, 'insert with platform_fee = 0 succeeded — this is the quiet exploit')
    return `[${errCode(error)}]`
  })

  await check('a forged services snapshot is discarded, not trusted', async () => {
    const { data: forged, error } = await insertAsClient({
      ...clientPayload(customerId, []),
      services: [{ id: ID.pkgFull, name: 'Free Detail', base_price: 1, duration_mins: 5 }],
    })
    assert(!error, `insert failed: [${errCode(error)}] ${error?.message}`)
    const single = priceLocally([both.find((p) => p.id === ID.pkgFull)], feeRate)
    assertEqualCents(forged.total_amount, single.total_amount, 'total_amount')
    assert(
      forged.services[0].name !== 'Free Detail',
      'the forged name survived into the stored snapshot',
    )
  })

  await check('an unknown package is refused (23503)', async () => {
    const { error } = await insertAsClient(clientPayload(customerId, [randomUUID()]))
    assert(error, 'insert referencing a nonexistent package succeeded')
    assert(
      errCode(error) === '23503',
      `expected 23503, got [${errCode(error)}] ${error.message}`,
    )
  })

  await check('an empty service list is refused (23514)', async () => {
    const { error } = await insertAsClient(clientPayload(customerId, []))
    assert(error, 'insert with no services succeeded')
    assert(
      errCode(error) === '23514',
      `expected 23514, got [${errCode(error)}] ${error.message}`,
    )
  })

  // Another provider's package priced against this provider would let a
  // customer cherry-pick the cheapest package in the marketplace. Only
  // meaningful if the project has a second provider with public packages.
  const { data: foreign } = await app
    .from('service_packages')
    .select('id, provider_id')
    .neq('provider_id', ID.providerProfile)
    .limit(1)

  if (foreign?.length) {
    await check("another provider's package is refused (23503)", async () => {
      const { error } = await insertAsClient(clientPayload(customerId, [foreign[0].id]))
      assert(error, "insert referencing another provider's package succeeded")
      assert(
        errCode(error) === '23503',
        `expected 23503, got [${errCode(error)}] ${error.message}`,
      )
    })
  } else {
    console.log("  – skipped: no second provider with visible packages to cross-reference")
  }

  // ── The abandon path ─────────────────────────────────────────────────────
  // handleConfirm calls abandonBooking() when the intent fails, the card
  // declines, or the sheet is dismissed. It has to clear
  // enforce_booking_status_transition as the customer, or a dismissed
  // PaymentSheet leaves an orphan `pending` booking with no payment behind it.
  console.log('\nabandon path — what runs when the PaymentSheet is dismissed')

  await check('customer can move pending → cancelled', async () => {
    const { data: toAbandon } = await insertAsClient(clientPayload(customerId, [ID.pkgExpress]))
    assert(toAbandon?.id, 'could not create a booking to abandon')
    const { data: cancelled, error } = await app
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', toAbandon.id)
      .select()
      .single()
    assert(
      !error,
      `abandonBooking would fail: [${errCode(error)}] ${error?.message}\n` +
        '      Every dismissed PaymentSheet would leave an unpaid pending booking behind.',
    )
    assert(cancelled.status === 'cancelled', `status is '${cancelled.status}'`)
  })

  await check('customer cannot self-confirm (status guard still bites)', async () => {
    const { data: target } = await insertAsClient(clientPayload(customerId, [ID.pkgExpress]))
    const { error } = await app
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', target.id)
    assert(error, 'customer confirmed their own booking — the status trigger is not firing')
    // enforce_booking_status_transition raises 42501, the same code a column
    // denial produces — so match the message too, or this check would pass for
    // the wrong reason if `status` ever fell out of the UPDATE grant list.
    assert(
      /is not a client transition/i.test(error.message),
      `expected the status-transition trigger, got [${errCode(error)}] ${error.message}`,
    )
    return `[${errCode(error)}] trigger`
  })

  await check('customer cannot rewrite a price after insert', async () => {
    const { error } = await app
      .from('bookings')
      .update({ total_amount: 1.0 })
      .eq('id', booking.id)
    assert(error, 'customer rewrote total_amount — the UPDATE grant list is too wide')
    assert(
      errCode(error) === '42501' || /permission denied/i.test(error.message),
      `expected 42501 permission denied, got [${errCode(error)}] ${error.message}`,
    )
    return `[${errCode(error)}]`
  })

  await finish()
}

async function finish() {
  // Cleanup runs as service_role: there is no client DELETE policy on bookings,
  // by design.
  if (createdBookingIds.length) {
    if (KEEP_ROWS) {
      console.log(`\n--keep: leaving ${createdBookingIds.length} booking(s) behind`)
      for (const id of createdBookingIds) console.log(`    ${id}`)
    } else {
      const { error } = await admin.from('bookings').delete().in('id', createdBookingIds)
      if (error) {
        console.warn(`\n⚠ cleanup failed (${error.message}); rows left: ${createdBookingIds.join(', ')}`)
      }
    }
  }

  const failed = results.filter((r) => !r.pass)
  const line = '─'.repeat(60)
  console.log(`\n${line}`)
  console.log(`${results.length - failed.length}/${results.length} checks passed`)

  if (failed.length) {
    console.log('\nfailed:')
    for (const f of failed) console.log(`  ✖ ${f.name}`)
    console.log(
      '\nNote: this script does not touch Stripe. A green run does NOT mean\n' +
        'checkout works end to end — create_deposit_intent, the PaymentSheet,\n' +
        'and the stripe-events promotion to pending_provider_approval still\n' +
        'need a simulator run.\n',
    )
    process.exit(1)
  }

  console.log(
    '\nThe client payload → column privileges → trigger → row seam is sound.\n' +
      'Still unverified: Stripe. create_deposit_intent, the PaymentSheet, and the\n' +
      'stripe-events promotion pending → pending_provider_approval need a real\n' +
      'simulator run — see Blueprint/quote_first_booking_handoff.md §4.\n',
  )
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}\n`)
  process.exit(1)
})
