#!/usr/bin/env node
/**
 * verify-job-day.mjs — drives the Phase 4 job-day actions against the real
 * project, as the real parties.
 *
 * WHY THIS EXISTS
 *
 * Jest mocks Supabase, so it cannot prove that a delay reported through
 * report_delay lands in the generated ready-by column and not in the committed
 * slot, that the ETA push respects its dedupe window across real requests, or
 * that the older actions now refuse the wrong party. This script signs in as
 * the seeded customer AND the seeded provider (anon key, real sessions) and
 * walks a provider's afternoon:
 *
 *   running late on the way → the next customer is affected → tell them →
 *   back on time → start → overrun during the job
 *
 * and checks, at each step, what the customer was told and what the wrong
 * party is refused. It also checks the calibration report's visibility.
 *
 * The two jobs are confirmed fixtures inserted with the service role, a couple
 * of hours from now (a delay can only be reported within a day of the start).
 * Every row this script creates is deleted at the end unless --keep is passed.
 *
 * STRIPE: nothing here touches Stripe. Completing a job charges the balance,
 * so the script only checks that completion is refused before the start.
 *
 * Requirements: as verify-quote-flow.mjs, plus migration 20260823000000 applied
 * and report_delay + notify-eta-changed deployed.
 *
 * Run:  node scripts/verify-job-day.mjs [--keep]
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

const MIN = 60 * 1000
const ms = (iso) => new Date(iso).getTime()

/** Invoke a stripe-webhook action and return { status, body }, reading error bodies back. */
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

async function etaPushes(customerId, bookingId) {
  const { data, error } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', customerId)
    .eq('type', 'eta_changed')
    .eq('metadata->>booking_id', bookingId)
  if (error) throw new Error(error.message)
  return data?.length ?? 0
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

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nverify-job-day — ${SUPABASE_URL}\n`)

  const customerId = await signIn(customer, CUSTOMER_EMAIL)
  const providerUserId = await signIn(provider, PROVIDER_EMAIL)
  console.log(`signed in: customer ${customerId}, provider ${providerUserId}\n`)

  // Job A starts on the next whole hour two hours from now and runs two hours
  // with 15/30 buffers, so the provider is free from A + 2h30. Job B starts
  // exactly then plus its own 15-minute before-buffer: on plan there is no
  // slack, and any delay on A reaches B. Job C is three days out.
  const hour = 60 * MIN
  const aStart = new Date(Math.ceil((Date.now() + 2 * hour) / hour) * hour)
  const bStart = new Date(aStart.getTime() + 2 * hour + 45 * MIN)
  const cStart = new Date(aStart.getTime() + 3 * 24 * hour)
  const jobA = randomUUID()
  const jobB = randomUUID()
  const jobC = randomUUID()
  const fixture = (id, start, durationMins) => ({
    id,
    customer_id: customerId,
    provider_id: ID.providerProfile,
    vehicle_id: ID.vehicle,
    services: [{ id: ID.pkgFull, name: 'Full Detail', base_price: 15000, duration_mins: durationMins }],
    status: 'confirmed',
    scheduled_at: start.toISOString(),
    service_address: '1600 Tysons Blvd, McLean, VA 22102',
    notes: 'verify-job-day.mjs',
    total_amount: 153.0,
    deposit_amount: 22.95,
    service_fee: 3.0,
    platform_fee: 0,
    provider_payout: 150.0,
    estimated_duration_mins: durationMins,
    buffer_before_mins: 15,
    buffer_after_mins: 30,
  })
  const { error: fixtureError } = await admin
    .from('bookings')
    .insert([fixture(jobA, aStart, 120), fixture(jobB, bStart, 60), fixture(jobC, cStart, 60)])
  if (fixtureError) {
    console.log(`  ✖ could not create confirmed fixtures: ${fixtureError.message}`)
    console.log('    (a 23P01 means the seeded provider already has a job in that slot)')
    return finish()
  }
  createdBookingIds.push(jobA, jobB, jobC)

  // ── Who may report ─────────────────────────────────────────────────────
  console.log('refusals')

  await check('the customer cannot report their provider late', async () => {
    const res = await act(customer, { action: 'report_delay', booking_id: jobA, delay_mins: 30 })
    assert(res.status === 403, `expected 403, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  await check('a delay is a whole five-minute step', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 17 })
    assert(res.status === 400, `expected 400, got ${res.status}`)
  })

  await check('a job days away is rescheduled, not reported late', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobC, delay_mins: 30 })
    assert(res.status === 409, `expected 409, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  // ── Running late on the way ────────────────────────────────────────────
  console.log('\nrunning late on the way')

  const beforeA = await row(jobA)
  let lastAffected = []

  await check('provider reports 30 min late: the ready-by moves, the slot does not', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 30 })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    lastAffected = res.body.affected ?? []
    const after = await row(jobA)
    assert(after.running_late_mins === 30, `running_late_mins is ${after.running_late_mins}`)
    assert(
      ms(after.estimated_completion_at) === aStart.getTime() + 150 * MIN,
      `ready-by is ${after.estimated_completion_at}`,
    )
    assert(after.occupied_range === beforeA.occupied_range, 'the committed slot moved')
    assert(res.body.notified === true, 'the customer was not pushed')
  })

  await check('notify-eta-changed ran (in-app notification row)', async () => {
    const count = await etaPushes(customerId, jobA)
    assert(count === 1, `expected 1 eta_changed row, found ${count}`)
  })

  await check('the knock-on names the next job and what it needs', async () => {
    const entry = lastAffected.find((e) => e.booking_id === jobB)
    assert(entry, `job B missing from ${JSON.stringify(lastAffected)}`)
    assert(entry.required_delay_mins === 30, `required ${entry.required_delay_mins}`)
    assert(entry.current_delay_mins === 0, `current ${entry.current_delay_mins}`)
    assert(ms(entry.projected_start_at) === bStart.getTime() + 30 * MIN, 'projected start is wrong')
    return `${entry.customer_name ?? 'customer'} → +${entry.required_delay_mins} min`
  })

  await check('a second small change inside the dedupe window is held', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 45 })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    assert(res.body.notified === false, 'pushed inside the dedupe window')
    assert((await etaPushes(customerId, jobA)) === 1, 'an extra eta_changed row was written')
  })

  await check('a big change goes through the window', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 90 })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    assert(res.body.notified === true, 'a 60-minute change was held')
    assert((await etaPushes(customerId, jobA)) === 2, 'no second eta_changed row')
    lastAffected = res.body.affected ?? []
  })

  await check('provider tells the next customer (shift)', async () => {
    const entry = lastAffected.find((e) => e.booking_id === jobB)
    assert(entry, 'job B missing from the knock-on')
    const res = await act(provider, {
      action: 'report_delay',
      booking_id: jobB,
      delay_mins: entry.required_delay_mins,
    })
    assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`)
    assert((await row(jobB)).running_late_mins === entry.required_delay_mins, 'B delay not stored')
    assert((await etaPushes(customerId, jobB)) === 1, 'B customer not pushed')
    return `+${entry.required_delay_mins} min`
  })

  await check('back on time offers to take the knock-on back', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 0 })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    const entry = (res.body.affected ?? []).find((e) => e.booking_id === jobB)
    assert(entry && entry.required_delay_mins === 0, `B entry is ${JSON.stringify(entry)}`)
    assert(entry.current_delay_mins > 0, 'B delay not reported as current')
  })

  // ── Start, then overrun ────────────────────────────────────────────────
  console.log('\nstart, then overrun')

  await check('starting the job clears a delay reported on the way', async () => {
    const report = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 30 })
    assert(report.status === 200, `report: ${report.status}`)
    const enRoute = await provider.from('bookings').update({ status: 'en_route' }).eq('id', jobA)
    assert(!enRoute.error, `en_route: ${enRoute.error?.message}`)
    const startedAt = new Date().toISOString()
    const started = await provider
      .from('bookings')
      .update({ status: 'in_progress', started_at: startedAt })
      .eq('id', jobA)
    assert(!started.error, `in_progress: ${started.error?.message}`)
    const after = await row(jobA)
    assert(after.running_late_mins === 0, `running_late_mins is ${after.running_late_mins}`)
    assert(
      ms(after.estimated_completion_at) === ms(after.started_at) + 120 * MIN,
      'ready-by is not the real start + duration',
    )
  })

  await check('a delay during the job moves the finish', async () => {
    const res = await act(provider, { action: 'report_delay', booking_id: jobA, delay_mins: 15 })
    assert(res.status === 200, `expected 200, got ${res.status}`)
    const after = await row(jobA)
    assert(
      ms(after.estimated_completion_at) === ms(after.started_at) + 135 * MIN,
      `ready-by is ${after.estimated_completion_at}`,
    )
  })

  // ── The older actions, now owner-checked ───────────────────────────────
  console.log('\nolder actions')

  await check('the customer cannot complete the job', async () => {
    const res = await act(customer, { action: 'capture_balance', booking_id: jobA })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('a job that has not started cannot be completed', async () => {
    const res = await act(provider, { action: 'capture_balance', booking_id: jobB })
    assert(res.status === 409, `expected 409, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  await check('the customer cannot mark their own no-show', async () => {
    const res = await act(customer, { action: 'mark_no_show', booking_id: jobB })
    assert(res.status === 403, `expected 403, got ${res.status}`)
    assert((await row(jobB)).status === 'confirmed', 'status changed')
  })

  await check('the customer cannot accept or decline for the provider', async () => {
    const accept = await act(customer, { action: 'accept_booking', booking_id: jobB })
    const decline = await act(customer, { action: 'decline_booking', booking_id: jobB })
    assert(accept.status === 403, `accept: expected 403, got ${accept.status}`)
    assert(decline.status === 403, `decline: expected 403, got ${decline.status}`)
  })

  await check('the provider cannot start the customer’s deposit payment', async () => {
    const res = await act(provider, { action: 'create_deposit_intent', booking_id: jobB })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  await check('a customer cannot run Connect onboarding for a provider', async () => {
    const res = await act(customer, { action: 'connect_status', provider_id: ID.providerProfile })
    assert(res.status === 403, `expected 403, got ${res.status}`)
  })

  // ── Calibration report ─────────────────────────────────────────────────
  console.log('\ncalibration report')

  const since = new Date(Date.now() - 365 * 24 * hour).toISOString()

  await check('the provider sees their own report and nobody else’s', async () => {
    const { data, error } = await provider.rpc('get_duration_calibration', { p_since: since })
    assert(!error, error?.message)
    assert(data.length === 1, `expected 1 row, got ${data.length}`)
    assert(data[0].provider_id === ID.providerProfile, 'a different provider’s report')
    return `${data[0].completed_jobs} completed, ${data[0].timed_jobs} timed`
  })

  await check('a customer sees no report', async () => {
    const { data, error } = await customer.rpc('get_duration_calibration', { p_since: since })
    assert(!error, error?.message)
    assert(data.length === 0, `expected none, got ${data.length}`)
  })

  await finish()
}

async function finish() {
  if (KEEP_ROWS) {
    console.log(`\n--keep: leaving ${createdBookingIds.length} booking(s) behind`)
    for (const id of createdBookingIds) console.log(`    ${id}`)
  } else if (createdBookingIds.length) {
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
  console.log('\nThe Phase 4 job-day actions behave as specified against the live project.\n')
}

main().catch(async (err) => {
  console.error(`\n✖ ${err.message}\n`)
  await finish()
})
