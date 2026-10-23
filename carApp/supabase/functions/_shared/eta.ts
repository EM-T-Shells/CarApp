// Live ETC, the overrun cascade and early finish — the arithmetic behind
// Phase 4 (Blueprint/quote_first_booking.md §2 "Overruns", §3 "Job day", §7).
//
// Pure TypeScript with no remote imports, for the same reason quote.ts and
// bookingPolicy.ts are: stripe-webhook imports it as '../_shared/eta.ts', the
// app imports the same file for the provider's controls, and Jest tests the
// shipping code directly (__tests__/eta.test.ts).
//
// The model, in one paragraph. A provider reports how far behind plan a job is
// (bookings.running_late_mins, through report_delay). Before the job starts
// that delays the expected arrival; after, the finish. The database folds it
// into estimated_completion_at, so every ready-by display follows it, and
// clears it when started_at is set, because the real start then carries it.
// What the provider committed to — occupied_range — never moves: a delay is
// news for the customer, not a new slot. A knock-on for later jobs is planned
// here and *communicated* (each later job gets its own reported delay), never
// written into anyone's schedule; moving a job is still a proposal.

export type EtaValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const MS_PER_MINUTE = 60_000;

/** Mirrors bookings_running_late_check in 20260823000000. */
export const MAX_RUNNING_LATE_MINS = 720;

/** What the running-late control offers (spec §3: "+15/+30/+60"). */
export const RUNNING_LATE_STEPS = [15, 30, 60] as const;

/**
 * Delays and offered start times are whole five-minute steps. The customer is
 * told "about 25 minutes late" or "1:45 PM", never "23 minutes" or "1:43 PM",
 * which would claim a precision nobody has.
 */
export const DELAY_STEP_MINS = 5;

/**
 * Spec §2: affected customers are told about a change of roughly fifteen
 * minutes or more. Smaller drift is within what "ready by ~2:30" already says.
 * The calibration report uses the same figure for "within estimate".
 */
export const ETA_MATERIALITY_MINS = 15;

/**
 * Spec §5: notify-eta-changed "needs a dedupe window". A provider tapping +15
 * three times in a minute is one piece of news, not three pushes.
 */
export const ETA_NOTIFY_DEDUPE_MINS = 10;

/**
 * …unless the ETA has moved this far since the last push. Holding back "an
 * hour late" because "15 minutes late" went out five minutes ago would leave
 * the customer acting on the smaller number.
 */
export const ETA_NOTIFY_BYPASS_MINS = 30;

/**
 * A job that has not started can be reported late only within this long of its
 * start. Further out, the honest move is a new time (propose_reschedule), not a
 * delay the customer will read as "on the way, but late".
 */
export const DELAY_REPORT_HORIZON_MINS = 24 * 60;

/** Where a delay can be reported: a committed job that has not finished. */
export const DELAY_REPORTABLE_STATUSES = [
  'confirmed',
  'en_route',
  'in_progress',
  'pending_adjustment_approval',
] as const;

/**
 * Later jobs the cascade can push: committed and not yet under way. A job
 * already en route or in progress is the one running late, not the one waiting.
 */
export const CASCADE_STATUSES = ['confirmed', 'pending_adjustment_approval'] as const;

/** How far past the delayed job's start the cascade looks for later jobs. */
export const CASCADE_HORIZON_MINS = 24 * 60;

/** An earlier start is offered only when it gains at least this much. */
export const EARLY_FINISH_MIN_GAIN_MINS = 15;

// ── Inputs ────────────────────────────────────────────────────────────

/** The booking columns a job's timing is computed from. */
export interface JobTiming {
  scheduledAt: string;
  startedAt: string | null;
  durationMins: number | null;
  runningLateMins: number;
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function minsOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Rounds a minute count up to the next whole step. Never negative. */
export function roundUpToStep(mins: number, step: number = DELAY_STEP_MINS): number {
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  return Math.ceil(mins / step) * step;
}

/** Rounds an instant up to the next whole step on the clock (1:43 → 1:45). */
export function roundUpInstantMs(ms: number, step: number = DELAY_STEP_MINS): number {
  const stepMs = step * MS_PER_MINUTE;
  return Math.ceil(ms / stepMs) * stepMs;
}

// ── Validation ────────────────────────────────────────────────────────

/**
 * The delay the provider reports, as an absolute figure rather than an
 * increment: a retried request then repeats the same statement instead of
 * stacking another fifteen minutes on top.
 */
export function validateDelayMins(input: unknown): EtaValidation<number> {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return { ok: false, error: 'delay_mins is required' };
  }
  if (!Number.isInteger(input) || input < 0) {
    return { ok: false, error: 'delay_mins must be a whole, non-negative number of minutes' };
  }
  if (input % DELAY_STEP_MINS !== 0) {
    return { ok: false, error: `delay_mins must be a multiple of ${DELAY_STEP_MINS}` };
  }
  if (input > MAX_RUNNING_LATE_MINS) {
    return {
      ok: false,
      error: `A delay over ${MAX_RUNNING_LATE_MINS / 60} hours is a new time. Propose one instead.`,
    };
  }
  return { ok: true, value: input };
}

/** Whether this booking can carry a reported delay right now. */
export function delayReportable(input: {
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  nowMs: number;
}): EtaValidation<true> {
  if (!(DELAY_REPORTABLE_STATUSES as readonly string[]).includes(input.status)) {
    return {
      ok: false,
      error: `A booking in status ${input.status} cannot be reported late`,
    };
  }

  const scheduledMs = toMs(input.scheduledAt);
  if (scheduledMs === null) {
    return { ok: false, error: 'This booking has no start time to be late for' };
  }

  if (
    input.startedAt === null &&
    scheduledMs - input.nowMs > DELAY_REPORT_HORIZON_MINS * MS_PER_MINUTE
  ) {
    return {
      ok: false,
      error: 'This job is more than a day away. Propose a new time instead.',
    };
  }

  return { ok: true, value: true };
}

// ── The ETA ───────────────────────────────────────────────────────────

/**
 * The instant the customer is waiting for, exactly as the generated
 * estimated_completion_at computes it: (started_at, else scheduled_at) +
 * duration + delay. With no known duration (a legacy row) it degrades to the
 * expected start, which is still the thing a delay moves.
 */
export function projectedEtaMs(job: JobTiming): number | null {
  const startMs = toMs(job.startedAt ?? job.scheduledAt);
  if (startMs === null) return null;
  return (
    startMs +
    (minsOrZero(job.durationMins) + minsOrZero(job.runningLateMins)) * MS_PER_MINUTE
  );
}

/**
 * When the customer should expect the provider: the booked start plus any
 * delay reported on the way. Null once the job has started — they are there.
 */
export function expectedArrivalMs(
  job: Pick<JobTiming, 'scheduledAt' | 'startedAt' | 'runningLateMins'>,
): number | null {
  if (job.startedAt) return null;
  const scheduledMs = toMs(job.scheduledAt);
  if (scheduledMs === null) return null;
  return scheduledMs + minsOrZero(job.runningLateMins) * MS_PER_MINUTE;
}

/**
 * Whether a new ETA is worth a push (spec §2, §5).
 *
 * `baselineMs` is what the customer was last told — eta_notified_completion_at,
 * or the ETA with no delay when nothing has been sent yet — so drift that never
 * reached them on its own adds up until it does.
 */
export function etaNotificationDue(input: {
  baselineMs: number;
  newMs: number;
  lastNotifiedAtMs: number | null;
  nowMs: number;
}): boolean {
  const movedMins = Math.abs(input.newMs - input.baselineMs) / MS_PER_MINUTE;
  if (movedMins < ETA_MATERIALITY_MINS) return false;

  const recentlyNotified =
    input.lastNotifiedAtMs !== null &&
    input.nowMs - input.lastNotifiedAtMs < ETA_NOTIFY_DEDUPE_MINS * MS_PER_MINUTE;

  return !recentlyNotified || movedMins >= ETA_NOTIFY_BYPASS_MINS;
}

// ── The overrun cascade (§2 "provider chooses shift / shorten / reschedule") ──

export interface CascadeJob extends JobTiming {
  id: string;
}

export interface CascadeEntry {
  bookingId: string;
  scheduledAt: string;
  /** When this job can now start, given the delayed job and those before it. */
  projectedStartAt: string;
  /** The delay this job should carry for its customer to be told the truth. */
  requiredDelayMins: number;
  /** The delay it carries now. */
  currentDelayMins: number;
}

/**
 * Walks the provider's later jobs and works out what the delayed job does to
 * each: when it can really start, given the delayed one's new finish and every
 * buffer in between.
 *
 * Returns only the jobs whose customers are now being told the wrong thing —
 * a later start than they know about, or a delay that no longer applies. The
 * provider chooses for each one (§2): tell them (shift, via report_delay on
 * that job), propose a new time (reschedule), or leave it and make the time up
 * (shorten) — so nothing here writes anything.
 *
 * Later jobs are projected from the delay they *require*, not the one they
 * carry, so the walk answers "what does this delay do to my day" rather than
 * echoing what was said before.
 */
export function planOverrunCascade(
  delayed: JobTiming,
  following: readonly CascadeJob[],
): CascadeEntry[] {
  const delayedEnd = projectedEtaMs(delayed);
  if (delayedEnd === null) return [];

  let freeFromMs = delayedEnd + minsOrZero(delayed.bufferAfterMins) * MS_PER_MINUTE;

  const ordered = following
    .filter((job) => job.startedAt === null && toMs(job.scheduledAt) !== null)
    .slice()
    .sort((a, b) => (toMs(a.scheduledAt) ?? 0) - (toMs(b.scheduledAt) ?? 0));

  const entries: CascadeEntry[] = [];

  for (const job of ordered) {
    const scheduledMs = toMs(job.scheduledAt) as number;
    const earliestStartMs = freeFromMs + minsOrZero(job.bufferBeforeMins) * MS_PER_MINUTE;
    const requiredDelayMins = Math.min(
      roundUpToStep((earliestStartMs - scheduledMs) / MS_PER_MINUTE),
      MAX_RUNNING_LATE_MINS,
    );
    const projectedStartMs = scheduledMs + requiredDelayMins * MS_PER_MINUTE;
    const currentDelayMins = minsOrZero(job.runningLateMins);

    if (requiredDelayMins !== currentDelayMins) {
      entries.push({
        bookingId: job.id,
        scheduledAt: new Date(scheduledMs).toISOString(),
        projectedStartAt: new Date(projectedStartMs).toISOString(),
        requiredDelayMins,
        currentDelayMins,
      });
    }

    freeFromMs =
      projectedStartMs +
      (minsOrZero(job.durationMins) + minsOrZero(job.bufferAfterMins)) * MS_PER_MINUTE;
  }

  return entries;
}

// ── Early finish (§7 "release the buffer, offer the next customer an earlier
//    slot, never auto-move them") ─────────────────────────────────────────

export interface NextJobCandidate {
  id: string;
  status: string;
  scheduledAt: string;
}

/**
 * The provider's next job after the one that just finished: the earliest
 * committed, not-yet-started job that starts no earlier than it did.
 */
export function pickNextJob<T extends NextJobCandidate>(
  finished: { id: string; scheduledAt: string },
  candidates: readonly T[],
): T | null {
  const finishedMs = toMs(finished.scheduledAt);
  if (finishedMs === null) return null;

  let next: T | null = null;
  let nextMs = Infinity;
  for (const job of candidates) {
    if (job.id === finished.id) continue;
    if (!(CASCADE_STATUSES as readonly string[]).includes(job.status)) continue;
    const ms = toMs(job.scheduledAt);
    if (ms === null || ms < finishedMs) continue;
    if (ms < nextMs) {
      next = job;
      nextMs = ms;
    }
  }
  return next;
}

export type EarlyFinishPlan =
  /** The next customer has been told a delay that is now wrong. */
  | { kind: 'update_delay'; bookingId: string; fromMins: number; toMins: number }
  /** There is room to start the next job earlier; offer it, never impose it. */
  | { kind: 'offer_earlier'; bookingId: string; startAt: string; earlierByMins: number };

/**
 * What finishing a job now means for the next one.
 *
 * The finished job's slot is already released (a completed booking leaves the
 * overlap guard), so the next job could start once the provider has packed up,
 * travelled and set up: now + the finished job's after-buffer + the next job's
 * before-buffer. Measured against that:
 *   • a delay the next customer was told that no longer matches → correct it
 *     (usually down to zero: they made the time back)
 *   • otherwise, if the next job could start materially earlier → offer it as
 *     a reschedule proposal, which the customer is free to ignore
 *
 * A job with a reschedule proposal already open is not offered another — that
 * would silently replace whatever the two of them were discussing.
 */
export function planAfterFinish(input: {
  nowMs: number;
  finishedBufferAfterMins: number | null;
  next: CascadeJob & { hasOpenProposal: boolean };
}): EarlyFinishPlan | null {
  const { next } = input;
  const scheduledMs = toMs(next.scheduledAt);
  if (scheduledMs === null || next.startedAt !== null) return null;

  const earliestStartMs = roundUpInstantMs(
    input.nowMs +
      (minsOrZero(input.finishedBufferAfterMins) + minsOrZero(next.bufferBeforeMins)) *
        MS_PER_MINUTE,
  );

  const requiredDelayMins = Math.min(
    roundUpToStep((earliestStartMs - scheduledMs) / MS_PER_MINUTE),
    MAX_RUNNING_LATE_MINS,
  );
  const currentDelayMins = minsOrZero(next.runningLateMins);

  if (requiredDelayMins !== currentDelayMins) {
    return {
      kind: 'update_delay',
      bookingId: next.id,
      fromMins: currentDelayMins,
      toMins: requiredDelayMins,
    };
  }

  if (requiredDelayMins > 0 || next.hasOpenProposal) return null;

  const earlierByMins = Math.floor((scheduledMs - earliestStartMs) / MS_PER_MINUTE);
  if (earlierByMins < EARLY_FINISH_MIN_GAIN_MINS) return null;

  return {
    kind: 'offer_earlier',
    bookingId: next.id,
    startAt: new Date(earliestStartMs).toISOString(),
    earlierByMins,
  };
}

// ── What the customer is told (notify-eta-changed) ────────────────────

/** "30 min", "1 hr", "1 hr 15 min". Mirrors formatDuration in src/utils/duration.ts. */
export function describeMinutes(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * "2:30 PM" on the job's own clock. The push is composed on a UTC server, so
 * the zone has to be named: the provider's, since that is where the job is.
 * An unusable zone falls back to UTC rather than failing the push.
 */
export function formatClockTime(iso: string, timeZone: string | null): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone ?? 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(date);
  }
}

export interface EtaMessageInput {
  providerName: string | null;
  timeZone: string | null;
  scheduledAt: string;
  startedAt: string | null;
  runningLateMins: number;
  /** estimated_completion_at after the change. */
  etaAt: string | null;
  /** What the customer had before: the last ETA pushed, or the plan. */
  previousEtaAt: string | null;
}

/**
 * The push for an ETA change. Before the job starts the customer is waiting
 * for an arrival, so that is what they are told; once it is under way, the
 * ready-by time.
 */
export function etaChangeMessage(input: EtaMessageInput): { title: string; body: string } {
  const who = input.providerName?.trim() || 'Your provider';

  if (!input.startedAt) {
    const late = minsOrZero(input.runningLateMins);
    if (late === 0) {
      return {
        title: 'Back on schedule',
        body: `${who} expects to arrive at ${formatClockTime(input.scheduledAt, input.timeZone)} as planned.`,
      };
    }
    const arrivalMs = (toMs(input.scheduledAt) ?? 0) + late * MS_PER_MINUTE;
    return {
      title: `Running about ${describeMinutes(late)} late`,
      body: `${who} now expects to arrive around ${formatClockTime(new Date(arrivalMs).toISOString(), input.timeZone)}.`,
    };
  }

  const etaMs = toMs(input.etaAt);
  const previousMs = toMs(input.previousEtaAt);
  if (etaMs === null) {
    return { title: 'Updated ready time', body: `${who} has updated when your car will be ready.` };
  }

  const readyBy = formatClockTime(new Date(etaMs).toISOString(), input.timeZone);
  if (previousMs === null || etaMs === previousMs) {
    return { title: 'Updated ready time', body: `${who} now expects your car to be ready around ${readyBy}.` };
  }

  const shift = describeMinutes(Math.abs(etaMs - previousMs) / MS_PER_MINUTE);
  return etaMs > previousMs
    ? {
        title: 'Taking a little longer',
        body: `${who} now expects your car to be ready around ${readyBy}, about ${shift} later than before.`,
      }
    : {
        title: 'Ahead of schedule',
        body: `${who} now expects your car to be ready around ${readyBy}, about ${shift} earlier than before.`,
      };
}
