// Provider active-job screen (Flows 5.4 / 5.5 / 5.6).
//
// The detail route for the provider dashboard's Jobs tab — pushed from the job
// queue (jobs/index) and past jobs (jobs/past). Shows the job from the
// provider's side (customer, vehicle, address, schedule, payout) and drives the
// job lifecycle:
//   pending_provider_approval → [Accept] → confirmed → [Start Travel] →
//   en_route → [I've Arrived] → in_progress → [Complete Job] → completed
// While awaiting approval the provider has a 2-hour window (countdown shown)
// to Accept (→ confirmed) or Decline (→ cancelled + deposit refund); a
// server-side sweep auto-cancels/refunds on timeout (Blocker #4 / Flow H1).
//
// While en_route / in_progress it streams the device GPS every 5s through the
// update-provider-location Edge Function (Flow 5.4) so the customer tracking
// screen updates. "Open in Maps" hands off to the device's maps app for real
// turn-by-turn directions (we have no routing API — see CLAUDE.md OSM note).
// Before/after photos are captured via JobPhotoCapture (Flow 5.5); a minimum
// count is required before completing. "Complete Job" calls captureBalance,
// which charges the remaining 85% server-side and queues the payout (Flow 5.6).
//
// expo-location is approved but not yet installed (External); like LiveMap's
// react-native-maps, this screen compiles against it and works once installed.
//
// Quote-first (Phase 3) additions on a confirmed job, all server actions:
//   • Adjust Job — propose a longer duration and/or extra charges (§7 "vehicle
//     worse than declared"). Nothing agreed moves until the customer approves;
//     the provider can withdraw it until then.
//   • Propose New Time — reschedule by proposal; the start moves only when the
//     customer accepts, and a customer's proposal is answered here.
//
// Job day (Phase 4), also server actions:
//   • Running late — +15/+30/+60 (and back down) through report_delay. The
//     customer's arrival / ready-by time follows it and they are pushed when it
//     moves materially. The response lists the later jobs the delay reaches;
//     for each the provider tells that customer, proposes a new time, or
//     leaves it (§2 shift / reschedule / shorten). Nothing moves on its own.
//   • Finished early — after Complete Job, the next job today is checked: a
//     delay its customer was told is corrected, or, with real room, they are
//     offered an earlier start as a reschedule proposal (§7: never auto-moved).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  RefreshControl,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  Calendar,
  Car,
  MapPin,
  MessageCircle,
  Navigation,
  Truck,
  Play,
  CheckCircle2,
  Check,
  X,
  Clock,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { StatusTimeline } from '../../../src/components/booking/StatusTimeline';
import { JobPhotoCapture } from '../../../src/components/provider/JobPhotoCapture';
import QuoteBuilder, { type QuoteDraft } from '../../../src/components/provider/QuoteBuilder';
import {
  RescheduleProposalCard,
  RescheduleSheet,
} from '../../../src/components/booking/RescheduleProposal';
import { Sheet } from '../../../src/components/ui/Sheet';
import { TextField } from '../../../src/components/ui/TextField';
import { RunningLateCard } from '../../../src/components/provider/RunningLateCard';
import { DelayKnockOn } from '../../../src/components/provider/DelayKnockOn';
import type { BookingStatus } from '../../../src/components/booking/StatusTimeline';
import { colors, spacing } from '../../../src/design/tokens';
import {
  getProviderJobById,
  getBookingPhotos,
  getProviderDaySchedule,
  getThreadByBooking,
  type ProviderJobSummary,
} from '../../../src/lib/supabase/queries';
import { updateBooking, insertMessageThread } from '../../../src/lib/supabase/mutations';
import {
  captureBalance,
  acceptBooking,
  adjustJobDuration,
  declineBooking,
  providerCancelBooking,
  markNoShow,
  proposeReschedule,
  reportDelay,
  respondReschedule,
  withdrawAdjustment,
  type DelayKnockOn as KnockOnEntry,
} from '../../../src/lib/stripe';
import { MAX_ADJUSTMENT_REASON_LENGTH } from '../../../supabase/functions/_shared/quote';
import {
  delayReportable,
  pickNextJob,
  planAfterFinish,
  type EarlyFinishPlan,
} from '../../../supabase/functions/_shared/eta';
import { sendProviderLocation } from '../../../src/lib/location/tracking';
import { useAuthStore } from '../../../src/state/auth';
import { centsToDisplay } from '../../../src/utils/money';
import { formatDateTime, formatTime } from '../../../src/utils/date';
import {
  formatBookingReadyBy,
  formatDuration,
  resolveExpectedArrival,
  resolveRunningLateMins,
} from '../../../src/utils/duration';
import { MIN_PHOTOS_PER_TYPE, photoRequirement } from '../../../src/utils/jobPhotos';
import type { ProviderJobParams } from '../../../src/types/navigation';
import type { BookingPhoto } from '../../../src/types/models';

const GPS_INTERVAL_MS = 5_000;
const ACTIVE_STATUSES: BookingStatus[] = ['en_route', 'in_progress'];

const COMPLETED_MESSAGE = 'Payment captured and your payout is queued.';

/** The next job after a finish, and what to offer its customer. */
interface NextJobOffer {
  plan: EarlyFinishPlan;
  next: ProviderJobSummary;
}

function dollarsToCents(amount: number | null | undefined): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

// Formats milliseconds-remaining as "1h 23m" / "12m 04s" for the approval
// countdown. Returns null once the deadline has passed.
function formatCountdown(msRemaining: number): string | null {
  if (msRemaining <= 0) return null;
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function ProviderJobScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<ProviderJobParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const user = useAuthStore((s) => s.user);

  const [job, setJob] = useState<ProviderJobSummary | null>(null);
  const [photos, setPhotos] = useState<BookingPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [adjustDraft, setAdjustDraft] = useState<QuoteDraft | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | undefined>();
  // Phase 4: the later jobs the last reported delay reaches, which one is being
  // acted on, and which one the provider is proposing a new time for.
  const [knockOn, setKnockOn] = useState<KnockOnEntry[]>([]);
  const [knockOnBusyId, setKnockOnBusyId] = useState<string | null>(null);
  const [knockOnReschedule, setKnockOnReschedule] = useState<KnockOnEntry | null>(null);
  const [delayNotice, setDelayNotice] = useState<string | null>(null);

  const photoReq = useMemo(() => photoRequirement(photos), [photos]);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────
  const fetchJob = useCallback(
    async (refresh = false) => {
      if (!bookingId) return;
      if (!refresh) setIsLoading(true);
      setError(null);
      const [jobRes, photosRes] = await Promise.all([
        getProviderJobById(bookingId),
        getBookingPhotos(bookingId),
      ]);
      if (jobRes.error) setError(jobRes.error);
      else setJob(jobRes.data);
      if (!photosRes.error) setPhotos(photosRes.data ?? []);
      setIsLoading(false);
    },
    [bookingId],
  );

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchJob(true).finally(() => setIsRefreshing(false));
  }, [fetchJob]);

  // ── Derived ──────────────────────────────────────────────────────────
  const status = (job?.status ?? 'pending') as BookingStatus;
  const providerId = job?.provider_id ?? null;
  const customerName = job?.customer?.full_name ?? 'Customer';
  const customerAvatar = job?.customer?.avatar_url ?? null;
  const vehicle = job?.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` · ${vehicle.color}` : ''}`
    : null;
  const isActive = ACTIVE_STATUSES.includes(status);
  const isAwaitingApproval = status === 'pending_provider_approval';
  const approvalMsLeft = job?.approval_expires_at
    ? new Date(job.approval_expires_at).getTime() - now
    : 0;
  const countdownLabel = formatCountdown(approvalMsLeft);
  const payoutCents = dollarsToCents(job?.provider_payout);
  const totalCents = dollarsToCents(job?.total_amount);
  const hasDestination = job?.location_lat != null && job?.location_lng != null;
  // A delay can be reported on a committed job that has not finished, and
  // before the start only within a day of it (_shared/eta.ts).
  const canReportDelay =
    job != null &&
    delayReportable({
      status: job.status,
      scheduledAt: job.scheduled_at,
      startedAt: job.started_at,
      nowMs: Date.now(),
    }).ok;
  const readyBy = job ? formatBookingReadyBy(job) : '';
  const expectedArrivalIso = job ? resolveExpectedArrival(job) : null;

  // ── Live GPS streaming while active ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function startWatch(): Promise<void> {
      if (!isActive || !providerId) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: 10,
        },
        (loc: { coords: { latitude: number; longitude: number } }) => {
          // Best-effort; the next tick retries on transient failure.
          void sendProviderLocation(providerId, {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );
    }

    startWatch();

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, [isActive, providerId]);

  // ── Approval-window countdown tick ───────────────────────────────────
  // Only runs while the booking is awaiting approval; updates the visible
  // countdown once per second. The actual auto-cancel is server-side
  // (expire_pending_approvals) — this is display only.
  useEffect(() => {
    if (!isAwaitingApproval) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isAwaitingApproval]);

  // ── Accept / decline (Blocker #4 / Flow H1) ──────────────────────────
  const handleAccept = useCallback(() => {
    if (!job) return;
    Alert.alert('Accept this booking?', 'The customer will be notified that you confirmed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setIsMutating(true);
          const result = await acceptBooking(job.id);
          setIsMutating(false);
          if (result.error) {
            Alert.alert('Could not accept', result.error.message);
            fetchJob(true);
            return;
          }
          fetchJob(true);
        },
      },
    ]);
  }, [job, fetchJob]);

  const runDecline = useCallback(
    async (reason?: string) => {
      if (!job) return;
      setIsMutating(true);
      const result = await declineBooking(job.id, reason?.trim() || undefined);
      setIsMutating(false);
      if (result.error) {
        Alert.alert('Could not decline', result.error.message);
        fetchJob(true);
        return;
      }
      fetchJob(true);
      Alert.alert('Booking declined', "The customer's deposit has been refunded.");
    },
    [job, fetchJob],
  );

  const handleDecline = useCallback(() => {
    if (!job) return;
    // Alert.prompt is iOS-only; on Android fall back to a plain confirm
    // (spec H1b asks for a reason but does not require one).
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Decline this booking?',
        "Tell the customer why (optional). We'll refund their deposit in full.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Decline', style: 'destructive', onPress: (reason?: string) => runDecline(reason) },
        ],
        'plain-text',
      );
      return;
    }
    Alert.alert('Decline this booking?', "We'll refund the customer's deposit in full.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => runDecline() },
    ]);
  }, [job, runDecline]);

  // ── Provider cancellation & no-show (Blocker #5) ─────────────────────
  // Both run server-side. Provider-cancel refunds the customer in full and
  // records the $25 penalty (if within 24h). No-show forfeits the customer's
  // full booking amount with no refund.
  const handleProviderCancel = useCallback(() => {
    if (!job) return;
    const confirmCancel = (reason?: string) =>
      Alert.alert(
        'Cancel this job?',
        "The customer's deposit will be refunded in full. If you're within 24 hours of the appointment, a $25 penalty applies and may be deducted from a future payout.",
        [
          { text: 'Keep Job', style: 'cancel' },
          {
            text: 'Cancel Job',
            style: 'destructive',
            onPress: async () => {
              setIsMutating(true);
              const result = await providerCancelBooking(job.id, reason?.trim() || undefined);
              setIsMutating(false);
              if (result.error) {
                Alert.alert('Could not cancel', result.error.message);
                fetchJob(true);
                return;
              }
              fetchJob(true);
              const penalty = result.data?.penalty_cents ?? 0;
              Alert.alert(
                'Job cancelled',
                penalty > 0
                  ? `The customer was refunded in full. A ${centsToDisplay(penalty)} penalty was recorded.`
                  : 'The customer was refunded in full.',
              );
            },
          },
        ],
      );

    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Cancel this job?',
        'Tell the customer why (optional).',
        [
          { text: 'Keep Job', style: 'cancel' },
          { text: 'Continue', onPress: (reason?: string) => confirmCancel(reason) },
        ],
        'plain-text',
      );
      return;
    }
    confirmCancel();
  }, [job, fetchJob]);

  const handleNoShow = useCallback(() => {
    if (!job) return;
    Alert.alert(
      'Mark as no-show?',
      'Confirm the customer did not show up for the appointment. Per the cancellation policy they forfeit the full booking amount and are not refunded.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Mark No-Show',
          style: 'destructive',
          onPress: async () => {
            setIsMutating(true);
            const result = await markNoShow(job.id);
            setIsMutating(false);
            if (result.error) {
              Alert.alert('Could not mark no-show', result.error.message);
              fetchJob(true);
              return;
            }
            fetchJob(true);
          },
        },
      ],
    );
  }, [job, fetchJob]);

  // ── Lifecycle transitions ────────────────────────────────────────────
  const transition = useCallback(
    async (next: BookingStatus, extra: Record<string, unknown> = {}) => {
      if (!job) return;
      setIsMutating(true);
      const { data, error: err } = await updateBooking(job.id, {
        status: next,
        ...extra,
      });
      setIsMutating(false);
      if (err) {
        Alert.alert('Update failed', err.message);
        return;
      }
      if (data) setJob((prev) => (prev ? { ...prev, ...data } : prev));
    },
    [job],
  );

  const handleStartTravel = useCallback(() => transition('en_route'), [transition]);
  const handleArrive = useCallback(
    () => transition('in_progress', { started_at: new Date().toISOString() }),
    [transition],
  );

  // ── Finished early (§7) ──────────────────────────────────────────────
  // The finished job's slot is released the moment it completes, so the next
  // job today could start once the provider has packed up, travelled and set
  // up. planAfterFinish decides whether that changes anything for its
  // customer: a delay they were told that no longer holds, or room to offer an
  // earlier start. Only today's jobs: offering to pull tomorrow's job forward
  // to this afternoon is not an early finish.
  const planNextJob = useCallback(
    async (finished: ProviderJobSummary): Promise<NextJobOffer | null> => {
      if (!finished.provider_id) return null;
      const day = await getProviderDaySchedule(finished.provider_id, new Date());
      if (day.error) return null;

      const dayEndMs = new Date(day.data.range.end).getTime();
      const candidates = day.data.bookings
        .filter((b) => new Date(b.scheduled_at).getTime() < dayEndMs)
        .map((b) => ({ id: b.id, status: b.status, scheduledAt: b.scheduled_at, booking: b }));
      const next = pickNextJob(
        { id: finished.id, scheduledAt: finished.scheduled_at },
        candidates,
      );
      if (!next) return null;

      const plan = planAfterFinish({
        nowMs: Date.now(),
        finishedBufferAfterMins: finished.buffer_after_mins,
        next: {
          id: next.booking.id,
          scheduledAt: next.booking.scheduled_at,
          startedAt: next.booking.started_at,
          durationMins: next.booking.estimated_duration_mins,
          runningLateMins: next.booking.running_late_mins,
          bufferBeforeMins: next.booking.buffer_before_mins,
          bufferAfterMins: next.booking.buffer_after_mins,
          hasOpenProposal: next.booking.proposed_scheduled_at != null,
        },
      });
      return plan ? { plan, next: next.booking } : null;
    },
    [],
  );

  // One alert, not two in a row: iOS drops an alert presented over another.
  const announceCompletion = useCallback((offer: NextJobOffer | null) => {
    if (!offer) {
      Alert.alert('Job complete', COMPLETED_MESSAGE);
      return;
    }

    const { plan, next } = offer;
    const who = next.customer?.full_name ?? 'Your next customer';
    const when = formatTime(next.scheduled_at);
    const fail = (title: string, message: string) => Alert.alert(title, message);

    if (plan.kind === 'offer_earlier') {
      const start = formatTime(plan.startAt);
      Alert.alert(
        'Job complete — you finished early',
        `${COMPLETED_MESSAGE}\n\n${who} is booked for ${when}. Offer to start at ${start} instead? They can accept or keep their time.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: `Offer ${start}`,
            onPress: async () => {
              const result = await proposeReschedule(plan.bookingId, plan.startAt);
              if (result.error) fail('Could not send the offer', result.error.message);
            },
          },
        ],
      );
      return;
    }

    const later = plan.toMins > plan.fromMins;
    const message = later
      ? `You can’t make ${who}’s ${when} job on time. Tell them you’ll be about ${formatDuration(plan.toMins)} late?`
      : plan.toMins === 0
        ? `${who} was told you’d be ${formatDuration(plan.fromMins)} late for ${when}. You’re on time now — tell them?`
        : `${who} was told you’d be ${formatDuration(plan.fromMins)} late for ${when}. It’s now about ${formatDuration(plan.toMins)} — tell them?`;
    Alert.alert('Job complete', `${COMPLETED_MESSAGE}\n\n${message}`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: later ? 'Let them know' : 'Update them',
        onPress: async () => {
          const result = await reportDelay(plan.bookingId, plan.toMins);
          if (result.error) fail('Could not update', result.error.message);
        },
      },
    ]);
  }, []);

  const handleComplete = useCallback(() => {
    if (!job) return;
    if (!photoReq.satisfied) {
      Alert.alert(
        'Add more photos',
        `Every job needs at least ${MIN_PHOTOS_PER_TYPE} before and ${MIN_PHOTOS_PER_TYPE} after photos. Capture ${photoReq.missingLabel}.`,
      );
      return;
    }
    Alert.alert(
      'Complete this job?',
      "We'll charge the customer's remaining balance and queue your payout.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Job',
          onPress: async () => {
            setIsMutating(true);
            const result = await captureBalance(job.id);
            setIsMutating(false);
            if (result.error) {
              Alert.alert('Could not complete', result.error.message);
              return;
            }
            // The Edge Function transitions the booking to completed and queues
            // the payout server-side — refetch to reflect it.
            fetchJob(true);
            announceCompletion(await planNextJob(job));
          },
        },
      ],
    );
  }, [job, photoReq, fetchJob, planNextJob, announceCompletion]);

  // ── Running late (§2, §3) ────────────────────────────────────────────
  const handleReportDelay = useCallback(
    async (delayMins: number) => {
      if (!job) return;
      setIsMutating(true);
      const result = await reportDelay(job.id, delayMins);
      setIsMutating(false);
      if (result.error) {
        Alert.alert('Could not update', result.error.message);
        fetchJob(true);
        return;
      }
      setKnockOn(result.data.affected ?? []);
      // Below the materiality threshold, or inside the dedupe window, nobody
      // is pushed — but the customer's screen follows the row live either way.
      setDelayNotice(
        result.data.notified
          ? `${customerName} was notified.`
          : `Saved. ${customerName} sees the new time in the app.`,
      );
      fetchJob(true);
    },
    [job, customerName, fetchJob],
  );

  const dropKnockOn = useCallback((bookingId: string) => {
    setKnockOn((prev) => prev.filter((entry) => entry.booking_id !== bookingId));
  }, []);

  // Shift: the later job carries the delay it needs, and its customer is told.
  const handleKnockOnTell = useCallback(
    async (entry: KnockOnEntry) => {
      setKnockOnBusyId(entry.booking_id);
      const result = await reportDelay(entry.booking_id, entry.required_delay_mins);
      setKnockOnBusyId(null);
      if (result.error) {
        Alert.alert('Could not update', result.error.message);
        return;
      }
      dropKnockOn(entry.booking_id);
    },
    [dropKnockOn],
  );

  // Reschedule: a proposal the customer accepts or not.
  const handleKnockOnPropose = useCallback(
    async (scheduledAt: string) => {
      const entry = knockOnReschedule;
      if (!entry) return;
      setKnockOnBusyId(entry.booking_id);
      const result = await proposeReschedule(entry.booking_id, scheduledAt);
      setKnockOnBusyId(null);
      if (result.error) {
        Alert.alert('Could not propose', result.error.message);
        return;
      }
      setKnockOnReschedule(null);
      dropKnockOn(entry.booking_id);
    },
    [knockOnReschedule, dropKnockOn],
  );

  // ── Adjust a confirmed job (§7) ──────────────────────────────────────
  const openAdjust = useCallback(() => {
    if (!job) return;
    setAdjustDraft({
      scheduledAt: null,
      durationMins: job.estimated_duration_mins ?? job.suggested_duration_mins ?? 60,
      lineItems: [],
    });
    setAdjustReason('');
    setAdjustError(undefined);
  }, [job]);

  const handleSubmitAdjust = useCallback(async () => {
    if (!job || !adjustDraft) return;
    setIsMutating(true);
    setAdjustError(undefined);
    const result = await adjustJobDuration({
      bookingId: job.id,
      estimatedDurationMins: adjustDraft.durationMins,
      lineItems: adjustDraft.lineItems
        .filter((item) => item.label.trim().length > 0 && item.amountCents > 0)
        .map((item) => ({ label: item.label.trim(), amount_cents: item.amountCents })),
      reason: adjustReason.trim(),
    });
    setIsMutating(false);
    if (result.error) {
      // Inline: the distinctions matter (nothing changed, below the deposit,
      // no longer confirmed) and the form is still open to fix it.
      setAdjustError(result.error.message);
      return;
    }
    setAdjustDraft(null);
    fetchJob(true);
    Alert.alert('Change sent', 'The customer has been asked to approve it. Nothing changes until they do.');
  }, [job, adjustDraft, adjustReason, fetchJob]);

  const handleWithdrawAdjust = useCallback(async () => {
    if (!job) return;
    setIsMutating(true);
    const result = await withdrawAdjustment(job.id);
    setIsMutating(false);
    if (result.error) Alert.alert('Could not withdraw', result.error.message);
    fetchJob(true);
  }, [job, fetchJob]);

  // ── Reschedule, by proposal ──────────────────────────────────────────
  const handleProposeReschedule = useCallback(
    async (scheduledAt: string) => {
      if (!job) return;
      setIsMutating(true);
      const result = await proposeReschedule(job.id, scheduledAt);
      setIsMutating(false);
      if (result.error) {
        Alert.alert('Could not propose', result.error.message);
        return;
      }
      setShowRescheduleSheet(false);
      fetchJob(true);
    },
    [job, fetchJob],
  );

  const handleRespondReschedule = useCallback(
    async (accept: boolean) => {
      if (!job) return;
      setIsMutating(true);
      const result = await respondReschedule(job.id, accept);
      setIsMutating(false);
      if (result.error) Alert.alert('Could not update', result.error.message);
      fetchJob(true);
    },
    [job, fetchJob],
  );

  // ── Navigate / message ───────────────────────────────────────────────
  const handleOpenInMaps = useCallback(() => {
    if (!job?.location_lat || !job?.location_lng) return;
    const lat = job.location_lat;
    const lng = job.location_lng;
    const label = encodeURIComponent(job.service_address ?? 'Service location');
    const url =
      Platform.select({
        ios: `maps://?daddr=${lat},${lng}&q=${label}`,
        android: `google.navigation:q=${lat},${lng}`,
      }) ?? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
    );
  }, [job?.location_lat, job?.location_lng, job?.service_address]);

  const handleMessage = useCallback(async () => {
    if (!job) return;
    setIsMutating(true);
    const existing = await getThreadByBooking(job.id);
    let threadId = existing.data?.id ?? null;
    if (!threadId) {
      const created = await insertMessageThread({
        booking_id: job.id,
        customer_id: job.customer_id,
        provider_id: job.provider_id,
      });
      if (created.error) {
        setIsMutating(false);
        Alert.alert('Message failed', created.error.message);
        return;
      }
      threadId = created.data.id;
    }
    setIsMutating(false);
    // Thread detail is shared across both dashboards — it keys off the
    // authenticated user, so the provider reuses the customer group's screen.
    router.push(`/(tabs)/inbox/${threadId}`);
  }, [job, router]);

  // ── Loading / error / authorization ──────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Job' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  if (error || !job) {
    return (
      <>
        <Stack.Screen options={{ title: 'Job' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <Text variant="subheading" color="charcoal">
            Job not found
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error?.message ?? "We couldn't load this job."}
          </Text>
          <Spacer size="lg" />
          <Button label="Back to Jobs" variant="primary" onPress={() => router.replace('/bookings')} />
        </View>
      </>
    );
  }

  // Only the assigned provider may manage the job.
  if (user && job.provider_profiles?.users?.id && user.id !== job.provider_profiles.users.id) {
    return (
      <>
        <Stack.Screen options={{ title: 'Job' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <Text variant="subheading" color="charcoal">
            Not your job
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            This job belongs to another provider.
          </Text>
          <Spacer size="lg" />
          <Button label="Back to Jobs" variant="primary" onPress={() => router.replace('/bookings')} />
        </View>
      </>
    );
  }

  const isTerminal =
    status === 'completed' || status === 'cancelled' || status === 'no_show';

  return (
    <>
      <Stack.Screen options={{ title: 'Job' }} />
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={palette.electricBlue}
            />
          }
        >
          {/* Customer header */}
          <Card variant="elevated">
            <View style={styles.row}>
              <Avatar uri={customerAvatar} name={customerName} size="md" />
              <View style={styles.flexCol}>
                <Text variant="label" color="midGray">
                  Customer
                </Text>
                <Text variant="subheading" color="charcoal" numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
            </View>
          </Card>

          <Spacer size="lg" />

          {/* Status */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Status
            </Text>
            <Spacer size="md" />
            <StatusTimeline status={status} />
          </Card>

          <Spacer size="lg" />

          {canReportDelay && (
            <>
              <RunningLateCard
                runningLateMins={resolveRunningLateMins(job)}
                started={job.started_at != null}
                readyBy={readyBy}
                expectedArrival={expectedArrivalIso ? formatTime(expectedArrivalIso) : ''}
                customerLabel={customerName}
                onReport={handleReportDelay}
                busy={isMutating}
                notice={delayNotice}
              />
              <Spacer size="lg" />
            </>
          )}

          {knockOn.length > 0 && (
            <>
              <DelayKnockOn
                entries={knockOn}
                busyId={knockOnBusyId}
                onTell={handleKnockOnTell}
                onPropose={setKnockOnReschedule}
                onLeave={(entry) => dropKnockOn(entry.booking_id)}
              />
              <Spacer size="lg" />
            </>
          )}

          {status === 'pending_adjustment_approval' && job.adjustment_total_amount != null && (
            <>
              <View testID="adjustment-pending">
                <Card>
                  <Text variant="label" color="charcoal">
                    Waiting on the customer
                  </Text>
                  <Spacer size="sm" />
                  <Text variant="body" color="midGray">
                    You proposed {formatDuration(job.adjustment_duration_mins) || 'a new duration'}{' '}
                    and a new total of {centsToDisplay(dollarsToCents(job.adjustment_total_amount))}.
                    The job stays as agreed until they approve.
                  </Text>
                  <Spacer size="md" />
                  <Button
                    label="Withdraw Change"
                    variant="secondary"
                    size="md"
                    onPress={handleWithdrawAdjust}
                    loading={isMutating}
                    testID="adjustment-withdraw"
                  />
                </Card>
              </View>
              <Spacer size="lg" />
            </>
          )}

          {status === 'confirmed' && job.proposed_scheduled_at && (
            <>
              <RescheduleProposalCard
                proposedAt={job.proposed_scheduled_at}
                proposedByViewer={job.reschedule_proposed_by === 'provider'}
                otherPartyLabel={customerName}
                onAccept={() => handleRespondReschedule(true)}
                onDecline={() => handleRespondReschedule(false)}
                onWithdraw={() => handleRespondReschedule(false)}
                busy={isMutating}
              />
              <Spacer size="lg" />
            </>
          )}

          {/* Details */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Details
            </Text>
            <Spacer size="md" />
            <View style={styles.detailRow}>
              <Calendar size={16} color={palette.midGray} strokeWidth={2} />
              <View style={styles.detailText}>
                <Text variant="bodySmall" color="midGray">
                  Scheduled for
                </Text>
                <Text variant="body" color="charcoal">
                  {formatDateTime(job.scheduled_at)}
                </Text>
                {job.estimated_duration_mins != null && (
                  <Text variant="caption" color="midGray">
                    Est. {formatDuration(job.estimated_duration_mins)}
                    {readyBy ? ` · ready by ${readyBy}` : ''}
                  </Text>
                )}
              </View>
            </View>
            {vehicleLabel && (
              <>
                <Spacer size="md" />
                <View style={styles.detailRow}>
                  <Car size={16} color={palette.midGray} strokeWidth={2} />
                  <View style={styles.detailText}>
                    <Text variant="bodySmall" color="midGray">
                      Vehicle
                    </Text>
                    <Text variant="body" color="charcoal">
                      {vehicleLabel}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {job.service_address && (
              <>
                <Spacer size="md" />
                <View style={styles.detailRow}>
                  <MapPin size={16} color={palette.midGray} strokeWidth={2} />
                  <View style={styles.detailText}>
                    <Text variant="bodySmall" color="midGray">
                      Service address
                    </Text>
                    <Text variant="body" color="charcoal">
                      {job.service_address}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {job.notes != null && job.notes.length > 0 && (
              <>
                <Spacer size="md" />
                <Text variant="bodySmall" color="midGray">
                  Notes
                </Text>
                <Spacer size="xs" />
                <Text variant="body" color="charcoal">
                  {job.notes}
                </Text>
              </>
            )}
          </Card>

          <Spacer size="lg" />

          {/* Payout */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Earnings
            </Text>
            <Spacer size="md" />
            <View style={styles.payoutRow}>
              <Text variant="body" color="midGray">
                Job total
              </Text>
              <Text variant="body" color="charcoal">
                {centsToDisplay(totalCents)}
              </Text>
            </View>
            <Spacer size="xs" />
            <View style={styles.payoutRow}>
              <Text variant="label" color="charcoal">
                Your payout
              </Text>
              <Text variant="price" color="emeraldGreen">
                {centsToDisplay(payoutCents)}
              </Text>
            </View>
          </Card>

          <Spacer size="lg" />

          {/* Photos */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Before / after photos
            </Text>
            <Spacer size="xs" />
            <Text variant="caption" color="midGray">
              {isTerminal
                ? `${photos.length} photo${photos.length === 1 ? '' : 's'} on file.`
                : `Add at least ${MIN_PHOTOS_PER_TYPE} of each to complete the job — before ${photoReq.before}/${MIN_PHOTOS_PER_TYPE}, after ${photoReq.after}/${MIN_PHOTOS_PER_TYPE}.`}
            </Text>
            <Spacer size="md" />
            <JobPhotoCapture
              bookingId={job.id}
              photos={photos}
              onChanged={() => fetchJob(true)}
              disabled={isTerminal}
            />
          </Card>

          <Spacer size={140} />
        </ScrollView>

        {/* Sticky action footer */}
        {!isTerminal && (
          <SafeAreaView edges={['bottom']} style={styles.stickyFooter}>
            <View
              style={[
                styles.footerInner,
                { backgroundColor: palette.offWhite, borderTopColor: isDark ? '#2A2A3E' : '#E5E7EB' },
              ]}
            >
              {status === 'pending' && (
                <Text variant="caption" color="midGray" style={styles.centeredText}>
                  Waiting for the customer to pay the deposit before this job can start.
                </Text>
              )}

              {isAwaitingApproval && (
                <>
                  <View style={styles.countdownRow}>
                    <Clock size={16} color={palette.gearGold} strokeWidth={2.5} />
                    <Text variant="label" style={{ color: palette.gearGold }}>
                      {countdownLabel
                        ? `Respond within ${countdownLabel}`
                        : 'Time expired — refreshing…'}
                    </Text>
                  </View>
                  <Spacer size="sm" />
                  <View style={styles.actionRow}>
                    <Button
                      label="Decline"
                      variant="secondary"
                      size="lg"
                      loading={isMutating}
                      onPress={handleDecline}
                      leftIcon={<X size={18} color={palette.deepIndigo} strokeWidth={2} />}
                      style={styles.flexBtn}
                      testID="job-decline"
                    />
                    <Button
                      label="Accept"
                      variant="primary"
                      size="lg"
                      loading={isMutating}
                      onPress={handleAccept}
                      leftIcon={<Check size={18} color={palette.offWhite} strokeWidth={2} />}
                      style={styles.flexBtn}
                      testID="job-accept"
                    />
                  </View>
                </>
              )}

              {status === 'confirmed' && (
                <>
                  <Button
                    label="Start Travel"
                    variant="primary"
                    size="lg"
                    loading={isMutating}
                    onPress={handleStartTravel}
                    leftIcon={<Truck size={18} color={palette.offWhite} strokeWidth={2} />}
                    testID="job-start-travel"
                  />
                  <Spacer size="sm" />
                  <View style={styles.actionRow}>
                    <Button
                      label="Adjust Job"
                      variant="secondary"
                      size="md"
                      onPress={openAdjust}
                      disabled={isMutating}
                      style={styles.flexBtn}
                      testID="job-adjust"
                    />
                    {!job.proposed_scheduled_at && (
                      <Button
                        label="New Time"
                        variant="secondary"
                        size="md"
                        onPress={() => setShowRescheduleSheet(true)}
                        disabled={isMutating}
                        style={styles.flexBtn}
                        testID="job-reschedule"
                      />
                    )}
                  </View>
                </>
              )}

              {status === 'en_route' && (
                <Button
                  label="I've Arrived & Start"
                  variant="primary"
                  size="lg"
                  loading={isMutating}
                  onPress={handleArrive}
                  leftIcon={<Play size={18} color={palette.offWhite} strokeWidth={2} />}
                  testID="job-arrive"
                />
              )}

              {status === 'in_progress' && (
                <Button
                  label="Complete Job"
                  variant="primary"
                  size="lg"
                  loading={isMutating}
                  onPress={handleComplete}
                  leftIcon={<CheckCircle2 size={18} color={palette.offWhite} strokeWidth={2} />}
                  testID="job-complete"
                />
              )}

              {/* Walking away from an unanswered adjustment is penalty-free
                  (bookingPolicy.cancellationFeeApplies). */}
              {status === 'pending_adjustment_approval' && (
                <Button
                  label="Cancel Job"
                  variant="ghost"
                  size="md"
                  loading={isMutating}
                  onPress={handleProviderCancel}
                  testID="job-provider-cancel"
                />
              )}

              {/* Provider cancel + customer no-show (Blocker #5). Available
                  once the booking is confirmed or the provider is en route. */}
              {(status === 'confirmed' || status === 'en_route') && (
                <>
                  <Spacer size="sm" />
                  <View style={styles.actionRow}>
                    <Button
                      label="No-Show"
                      variant="secondary"
                      size="md"
                      loading={isMutating}
                      onPress={handleNoShow}
                      style={styles.flexBtn}
                      testID="job-no-show"
                    />
                    <Button
                      label="Cancel Job"
                      variant="ghost"
                      size="md"
                      loading={isMutating}
                      onPress={handleProviderCancel}
                      style={styles.flexBtn}
                      testID="job-provider-cancel"
                    />
                  </View>
                </>
              )}

              <Spacer size="sm" />
              <View style={styles.actionRow}>
                <Button
                  label="Message"
                  variant="secondary"
                  size="md"
                  onPress={handleMessage}
                  loading={isMutating}
                  leftIcon={<MessageCircle size={16} color={palette.deepIndigo} strokeWidth={2} />}
                  style={styles.flexBtn}
                />
                {isActive && hasDestination && (
                  <Button
                    label="Open in Maps"
                    variant="secondary"
                    size="md"
                    onPress={handleOpenInMaps}
                    leftIcon={<Navigation size={16} color={palette.deepIndigo} strokeWidth={2} />}
                    style={styles.flexBtn}
                  />
                )}
              </View>
            </View>
          </SafeAreaView>
        )}

        <RescheduleSheet
          visible={showRescheduleSheet}
          onClose={() => setShowRescheduleSheet(false)}
          currentScheduledAt={job.scheduled_at}
          otherPartyLabel={customerName}
          onSubmit={handleProposeReschedule}
          submitting={isMutating}
        />

        {/* A later job the delay reaches: propose it a new time. */}
        <RescheduleSheet
          visible={knockOnReschedule !== null}
          onClose={() => setKnockOnReschedule(null)}
          currentScheduledAt={knockOnReschedule?.scheduled_at ?? job.scheduled_at}
          otherPartyLabel={knockOnReschedule?.customer_name ?? 'your customer'}
          onSubmit={handleKnockOnPropose}
          submitting={knockOnBusyId !== null}
        />

        {/* Adjustment: the same builder as a quote, with no window (the start
            is agreed) and the current total as the base. The server adds the
            charges and returns the total the customer will see. */}
        <Sheet
          visible={adjustDraft !== null}
          onClose={() => setAdjustDraft(null)}
          title="Adjust this job"
        >
          {adjustDraft && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text variant="body" color="midGray">
                Tell {customerName} what changed. Nothing is updated until they
                approve; if they decline, the booking is cancelled and they are
                refunded in full.
              </Text>
              <Spacer size="md" />
              <QuoteBuilder
                window={null}
                baseTotalCents={totalCents}
                baseLabel="Current total"
                totalLabel="New total"
                draft={adjustDraft}
                onChange={setAdjustDraft}
                error={adjustError}
              />
              <Spacer size="md" />
              <TextField
                label="Why?"
                value={adjustReason}
                onChangeText={(text) => setAdjustReason(text.slice(0, MAX_ADJUSTMENT_REASON_LENGTH))}
                placeholder="Heavy mud throughout the interior"
                multiline
                testID="adjust-reason"
              />
              <Spacer size="lg" />
              <Button
                label="Send to Customer"
                variant="primary"
                size="lg"
                onPress={handleSubmitAdjust}
                loading={isMutating}
                disabled={adjustReason.trim().length === 0}
                testID="adjust-send"
              />
              <Spacer size="base" />
            </ScrollView>
          )}
        </Sheet>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.base },
  centeredText: { textAlign: 'center', maxWidth: 300 },
  scroll: { padding: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flexCol: { flex: 1, gap: spacing.xs },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailText: { flex: 1, gap: spacing.xs },
  payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  footerInner: { padding: spacing.base, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
