#!/usr/bin/env node
/**
 * verify-quote-flow.mjs — drives the Phase 3 Edge Function actions against the
 * real project, as the real parties.
 *
 * WHY THIS EXISTS
 *
 * Every Jest suite mocks Supabase, and verify-checkout.mjs stops at the insert.
 * Neither proves that stripe-webhook's actions do what their unit-tested
 * grammar says once real rows, real grants and real tokens are involved: the
 * ownership checks, the guarded status updates, the arithmetic landing on the
 * row. This script signs in as the seeded customer AND the seeded provider
 * (anon key, real sessions) and walks the loop:
 *
 *   request → more info → quote → approve              (unpriced path)
 *   reschedule by proposal, adjustment approve/decline  (confirmed path)
 *
 * and, at every step, tries the wrong party first and expects a refusal.
 *
 * Confirmed bookings cannot be made from the client (that is the point of the
 * whole guard), so the confirmed-path fixtures are inserted with the service
 * role, exactly as seed-e2e.mjs does. Every row this script creates is deleted
 * at the end unless --keep is passed.
 *
 * STRIPE: test mode only. The script creates one SetupIntent (no card is
 * attached, nothing is charged) and refuses to run that step against a live
 * key. It never charges: with no card saved, accept_quote takes the PaymentSheet
 * fallback, which is the branch a script can check. The off-session charge
 * itself needs a real card on a simulator.
 *
 * Requirements: as verify-checkout.mjs, plus the seed (npm run seed:e2e) and
 * the Phase 3 actions deployed to stripe-webhook.
 *
 * Run:  node scripts/verify-quote-flow.mjs [--keep]
 *
 * NOTE — creates and deletes real booking rows and fires real notify-* calls to
 * the two seeded accounts. Test/staging projects only.
 */

import './lib/ipv4-dns.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEEP_ROWS = process.argv.includes('--keep')

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
    /* env may be provided directly */
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

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

// Must match scripts/seed-e2e.mjs.
const ID = {
  providerProfile: 'e2e00000-0000-4000-8000-000000000001',
  vehicle: 'e2e00000-0000-4000-8000-000000000002',
  pkgFull: 'e2e00000-0000-4000-8000-000000000010',
}
const CUSTOMER_EMAIL = 'test@carapp.dev'
const PROVIDER_EMAIL = 'provider@carapp.dev'

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const customer = createClient(SUPABASE_URL, ANON_KEY, clientOptions)
const provider = createClient(SUPABASE_URL, ANON_KEY, clientOptions)

// ── Harness ────────────────────────────────────────────────────────────────
const results = []
const createdBookingIds = []
const createdPaymentIds = []

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, pass: true })
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (err) {
    results.push({ name, pass: false })
    console.log(`  ✖ ${name}\n      ${err.message}`)
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

const toCents = (dollars) => Math.round(Number(dollars ?? 0) * 100)

/**
 * Invoke a stripe-webhook action and return { status, body }. invoke() hides
 * non-2xx bodies on error.context; reading it back is the whole point here,
 * since the refusals are what is being checked.
 */
async function act(client, body) {
  const { data, error } = await client.functions.invoke('stripe-webhook', { body })
  if (!error) return { status: 200, body: data }
  const response = error.context
  if (response && typeof response.json === 'function') {
    let parsed = null
    try {
      parsed = await response.clone().json()
    } catch {
      /* not JSON */
    }
    return { status: response.status, body: parsed }
  }
  return { status: 0, body: { error: error.message } }
}

async function row(bookingId) {
  const { data, error } = await admin.from('bookings').select('*').eq('id', bookingId).single()
  if (error) throw new Error(`read ${bookingId}: ${error.message}`)
  return data
}

async function signIn(client, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink(${email}): ${error.message} — run \`npm run seed:e2e\``)
  const tokenHash = data?.properties?.hashed_token
  for (const type of ['magiclink', 'email']) {
    const { data: verified, error: verifyError } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })
    if (!verifyError && verified?.session) return verified.session.user.id
  }
  throw new Error(`verifyOtp did not return a session for ${email}`)
}

// A week out, 12:00–16:00 UTC.
function windowFor(daysOut) {
  const start = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000)
  start.setUTCHours(12, 0, 0, 0)
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 4 * 60 * 60 * 1000).toISOString(),
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nverify-quote-flow — ${SUPABASE_URL}\n`)

  const customerId = await signIn(customer, CUSTOMER_EMAIL)
  const providerUserId = await signIn(provider, PROVIDER_EMAIL)
  console.log(`signed in: customer ${customerId}, provider ${providerUserId}\n`)

  // ── Unpriced path ────────────────────────────────────────────────────────
  console.log('unpriced path — request → more info → quote → approve')

  const window = windowFor(9)
  const { data: request, error: insertError } = await customer
    .from('bookings')
    .insert({
      customer_id: customerId,
      provider_id: ID.providerProfile,
      vehicle_id: ID.vehicle,
      services: [{ id: ID.pkgFull }],
      status: 'pending_provider_quote',
      service_address: '1600 Tysons Blvd, McLean, VA 22102',
      notes: 'verify-quote-flow.mjs',
      scheduled_at: window.start,
      requested_window_start: window.start,
      requested_window_end: window.end,
      vehicle_size_class: 'suv',
    })
    .select()
    .single()

  await check('customer creates an unpriced request', () => {
    assert(!insertError, `insert failed: ${insertError?.message}`)
    createdBookingIds.push(request.id)
    return request.id
  })
  if (insertError) return finish()

  await check('confirm_setup_intent refuses a request with no saved card', async () => {
    const res = await act(customer, { action: 'confirm_setup_intent', booking_id: request.id })
    assert(res.status === 409, `expected 409, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  await check('the provider cannot start saving the customer’s card', async () => {
    const res = await act(provider, { action: 'create_setup_intent', booking_id: request.id })
    assert(res.status === 403, `expected 403, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  if (STRIPE_PK.startsWith('pk_test_')) {
    await check('create_setup_intent returns a SetupIntent and records it (test mode)', async () => {
      const res = await act(customer, { action: 'create_setup_intent', booking_id: request.id })
      assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
      assert(res.body?.clientSecret?.startsWith('seti_'), 'no SetupIntent client secret')
      const after = await row(request.id)
      assert(after.stripe_setup_intent_id === res.body.setupIntentId, 'SetupIntent not recorded on the row')
      return res.body.setupIntentId
    })
  } else {
    console.log('  – skipped: SetupIntent step needs a pk_test_ key')
  }

  await check('the customer cannot quote their own request', async () => {
    const res = await act(customer, {
      action: 'submit_quote',
      booking_id: request.id,
      scheduled_at: window.start,
      estimated_duration_mins: 180,
    })
    assert(res.status === 403, `expected 403, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  await check('request_more_photos needs a note', async () => {
    const res = await act(provider, { action: 'request_more_photos', booking_id: request.id, note: ' ' })
    assert(res.status === 400, `expected 400, got ${res.status}`)
  })

  await check('provider sends the request back with a note', async () => {
    const res = await act(provider, {
      action: 'request_more_photos',
      booking_id: request.id,
      note: 'A photo of the back seats, please',
    })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(request.id)
    assert(after.status === 'awaiting_customer_info', `status is ${after.status}`)
    assert(after.info_request_note === 'A photo of the back seats, please', 'note not stored')
  })

  // fireNotify swallows failures by design, so a notify-* function that
  // stripe-webhook cannot reach (a missing deploy, or verify_jwt refusing the
  // injected service-role credential) is silent everywhere else. The in-app row
  // each notify function writes is the evidence it ran.
  await check('notify-photos-requested ran (in-app notification row)', async () => {
    const { data, error } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', customerId)
      .eq('type', 'photos_requested')
      .eq('metadata->>booking_id', request.id)
    assert(!error, error?.message)
    assert(
      data?.length > 0,
      'no photos_requested row — stripe-webhook did not reach notify-photos-requested',
    )
  })

  await check('the provider cannot hand it back for the customer', async () => {
    const res = await act(provider, { action: 'provide_customer_info', booking_id: request.id })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('customer hands the request back', async () => {
    const res = await act(customer, { action: 'provide_customer_info', booking_id: request.id })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    assert((await row(request.id)).status === 'pending_provider_quote', 'status did not return')
  })

  const before = await row(request.id)
  const baseCents = toCents(before.total_amount)

  await check('provider quotes: start inside the window, a duration, one surcharge', async () => {
    const res = await act(provider, {
      action: 'submit_quote',
      booking_id: request.id,
      scheduled_at: new Date(new Date(window.start).getTime() + 60 * 60 * 1000).toISOString(),
      estimated_duration_mins: 210,
      quote_line_items: [{ label: 'SUV', amount_cents: 3000 }],
    })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(request.id)
    assert(after.status === 'pending_customer_approval', `status is ${after.status}`)
    assert(toCents(after.quoted_total_amount) === baseCents + 3000, 'quoted total is not base + surcharge')
    assert(toCents(after.total_amount) === baseCents, 'submit_quote moved total_amount — only accept_quote may')
    return `$${((baseCents + 3000) / 100).toFixed(2)}`
  })

  await check('the provider cannot approve their own quote', async () => {
    const res = await act(provider, { action: 'accept_quote', booking_id: request.id })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('customer approves; with no saved card the server asks for the PaymentSheet', async () => {
    const res = await act(customer, { action: 'accept_quote', booking_id: request.id })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    assert(res.body.next === 'requires_deposit', `next is ${res.body.next}`)
    const after = await row(request.id)
    assert(after.status === 'pending', `status is ${after.status}`)
    assert(toCents(after.total_amount) === baseCents + 3000, 'total_amount is not the quoted total')
    assert(
      toCents(after.deposit_amount) === Math.floor((baseCents + 3000) * 0.15),
      'deposit is not 15% of the quoted total',
    )
    return `deposit $${(toCents(after.deposit_amount) / 100).toFixed(2)}`
  })

  await check('customer cancels the approved-but-unpaid booking with no fee', async () => {
    const res = await act(customer, { action: 'cancel_booking', booking_id: request.id })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    assert(res.body.fee_cents === 0, `fee_cents is ${res.body.fee_cents}`)
    assert((await row(request.id)).status === 'cancelled', 'not cancelled')
  })

  // ── Confirmed path ───────────────────────────────────────────────────────
  console.log('\nconfirmed path — reschedule and adjustment')

  // Service-role fixtures: a confirmed job with a succeeded deposit (the
  // approve path keeps it as recorded) and one with none (the decline path
  // refunds nothing, so no Stripe call is needed).
  const confirmedAt = windowFor(30).start
  const withDeposit = randomUUID()
  const withoutDeposit = randomUUID()
  const fixture = (id, hoursLater) => ({
    id,
    customer_id: customerId,
    provider_id: ID.providerProfile,
    vehicle_id: ID.vehicle,
    services: [{ id: ID.pkgFull, name: 'Full Detail', base_price: 15000, duration_mins: 180 }],
    status: 'confirmed',
    scheduled_at: new Date(new Date(confirmedAt).getTime() + hoursLater * 60 * 60 * 1000).toISOString(),
    service_address: '1600 Tysons Blvd, McLean, VA 22102',
    total_amount: 153.0,
    deposit_amount: 22.95,
    service_fee: 3.0,
    platform_fee: 0,
    provider_payout: 150.0,
    estimated_duration_mins: 180,
  })
  const { error: fixtureError } = await admin
    .from('bookings')
    .insert([fixture(withDeposit, 0), fixture(withoutDeposit, 48)])
  if (fixtureError) {
    console.log(`  ✖ could not create confirmed fixtures: ${fixtureError.message}`)
    return finish()
  }
  createdBookingIds.push(withDeposit, withoutDeposit)

  const paymentId = randomUUID()
  const { error: payError } = await admin.from('payments').insert({
    id: paymentId,
    booking_id: withDeposit,
    user_id: customerId,
    stripe_payment_intent_id: `pi_verify_${paymentId.slice(0, 8)}`,
    payment_type: 'deposit',
    amount: 22.95,
    status: 'succeeded',
  })
  if (!payError) createdPaymentIds.push(paymentId)

  const newStart = new Date(new Date(confirmedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()

  await check('customer proposes a new time; the start does not move yet', async () => {
    const res = await act(customer, {
      action: 'propose_reschedule',
      booking_id: withDeposit,
      scheduled_at: newStart,
    })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(withDeposit)
    assert(after.reschedule_proposed_by === 'customer', 'proposer not recorded')
    assert(new Date(after.scheduled_at).getTime() === new Date(confirmedAt).getTime(), 'the start moved on proposal')
  })

  await check('the customer cannot accept their own proposal', async () => {
    const res = await act(customer, { action: 'respond_reschedule', booking_id: withDeposit, accept: true })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('provider accepts; the start moves', async () => {
    const res = await act(provider, { action: 'respond_reschedule', booking_id: withDeposit, accept: true })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(withDeposit)
    assert(new Date(after.scheduled_at).getTime() === new Date(newStart).getTime(), 'start did not move')
    assert(after.proposed_scheduled_at === null, 'proposal not cleared')
  })

  await check('the customer cannot propose an adjustment', async () => {
    const res = await act(customer, {
      action: 'adjust_job_duration',
      booking_id: withDeposit,
      estimated_duration_mins: 240,
      reason: 'no',
    })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('provider proposes a longer, dearer job; nothing agreed moves', async () => {
    const res = await act(provider, {
      action: 'adjust_job_duration',
      booking_id: withDeposit,
      estimated_duration_mins: 240,
      adjustment_line_items: [{ label: 'Heavy mud', amount_cents: 2500 }],
      reason: 'Mud throughout the interior',
    })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(withDeposit)
    assert(after.status === 'pending_adjustment_approval', `status is ${after.status}`)
    assert(toCents(after.adjustment_total_amount) === 15300 + 2500, 'adjusted total is not total + charges')
    assert(toCents(after.total_amount) === 15300, 'total moved before approval')
  })

  await check('the provider cannot approve their own adjustment', async () => {
    const res = await act(provider, { action: 'respond_adjustment', booking_id: withDeposit, approve: true })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('customer approves; the deposit already paid is kept', async () => {
    const res = await act(customer, { action: 'respond_adjustment', booking_id: withDeposit, approve: true })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(withDeposit)
    assert(after.status === 'confirmed', `status is ${after.status}`)
    assert(toCents(after.total_amount) === 17800, `total is ${after.total_amount}`)
    assert(toCents(after.deposit_amount) === 2295, 'the charged deposit was recomputed')
    assert(after.estimated_duration_mins === 240, 'duration did not move')
    assert(after.adjustment_total_amount === null, 'adjustment not cleared')
    const items = after.quote_line_items ?? []
    assert(items.some((i) => i.label === 'Heavy mud' && i.amount_cents === 2500), 'charge not itemised')
    return `balance owed $${((17800 - 2295) / 100).toFixed(2)}`
  })

  await check('a declined adjustment cancels the booking with no fee', async () => {
    const proposed = await act(provider, {
      action: 'adjust_job_duration',
      booking_id: withoutDeposit,
      estimated_duration_mins: 240,
      reason: 'Bigger job than booked',
    })
    assert(proposed.status === 200, `propose: ${proposed.status} ${JSON.stringify(proposed.body)}`)
    const res = await act(customer, { action: 'respond_adjustment', booking_id: withoutDeposit, approve: false })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    const after = await row(withoutDeposit)
    assert(after.status === 'cancelled', `status is ${after.status}`)
    assert(after.cancellation_fee === null && after.deposit_forfeited === false, 'a fee was recorded')
    assert(after.adjustment_duration_mins === null, 'adjustment not cleared')
  })

  await finish()
}

async function finish() {
  if (KEEP_ROWS) {
    console.log(`\n--keep: leaving ${createdBookingIds.length} booking(s) behind`)
    for (const id of createdBookingIds) console.log(`    ${id}`)
  } else if (createdBookingIds.length) {
    // Children first. Notification rows written by the notify-* functions are
    // keyed by booking id in their metadata.
    for (const id of createdBookingIds) {
      await admin.from('notifications').delete().eq('metadata->>booking_id', id)
    }
    await admin.from('payments').delete().in('booking_id', createdBookingIds)
    const { error } = await admin.from('bookings').delete().in('id', createdBookingIds)
    if (error) console.warn(`\n⚠ cleanup failed (${error.message}); rows left: ${createdBookingIds.join(', ')}`)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    for (const f of failed) console.log(`  ✖ ${f.name}`)
    process.exit(1)
  }
  console.log(
    '\nThe Phase 3 actions behave as specified against the live project.\n' +
      'Still unverified: a real card — the SetupIntent sheet, the off-session deposit\n' +
      'and the stripe-events promotion need a simulator run.\n',
  )
}

main().catch(async (err) => {
  console.error(`\n✖ ${err.message}\n`)
  await finish()
})
