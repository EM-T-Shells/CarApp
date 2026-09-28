// Booking detail — destination of the Flow 2.4 post-payment route and the
// Flow 2.6 list-tap target. Renders the booking summary, lifecycle timeline,
// services snapshot, schedule, address, and payment breakdown. Surfaces
// action buttons for tracking (live GPS), messaging the provider, rescheduling,
// and cancelling. Cancellation policy (Blocker #5) is enforced server-side:
// cancelling within 24 hours of the scheduled time retains a $15 flat fee and
// refunds the remainder; earlier cancellations are refunded in full.
//
// Post-service additions (Flows 2.10 / 2.11 / 2.13):
//   - Before/after photo gallery once the provider uploads photos
//   - "Rate now" CTA that opens the ReviewSheet
//   - "Report an issue" CTA (48h dispute window) that flags the rating
//
// Quote-first (Phase 3) additions, each a server action rather than a write:
//   - Intake photos on an unpriced request, and handing a request back after
//     the provider asked for more (provide_customer_info)
//   - Reviewing a change the provider proposed to a confirmed job
//     (respond_adjustment — declining cancels with a full refund)
//   - Rescheduling by proposal: a confirmed start moves only when the other
//     party accepts (propose_reschedule / respond_reschedule). The direct
//     scheduled_at write this screen used to make was revoked in 20260822000000.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  Car,
  MapPin,
  MessageCircle,
  Navigation,
  CalendarClock,
  XCircle,
  AlertTriangle,
  Star,
  Flag,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { Sheet } from '../../../src/components/ui/Sheet';
import { GearRating } from '../../../src/components/ui/GearRating';
import { PriceBreakdown } from '../../../src/components/booking/PriceBreakdown';
import { DepositSummary } from '../../../src/components/booking/DepositSummary';
import { StatusTimeline } from '../../../src/components/booking/StatusTimeline';
import { ArrivalWindowPicker } from '../../../src/components/booking/ArrivalWindowPicker';
import IntakePhotoUploader, {
  uploadIntakePhoto,
  type PickedPhoto,
} from '../../../src/components/booking/IntakePhotoUploader';
import AdjustmentReviewCard from '../../../src/components/booking/AdjustmentReviewCard';
import {
  RescheduleProposalCard,
  RescheduleSheet,
} from '../../../src/components/booking/RescheduleProposal';
import { BookingPhotoGallery } from '../../../src/components/booking/BookingPhotoGallery';
import {
  ReviewSheet,
  type ReviewSubmission,
} from '../../../src/components/booking/ReviewSheet';
import { kudosToStorage } from '../../../src/components/kudos/KudosBadgeSelector';
import type { BookingStatus } from '../../../src/components/booking/StatusTimeline';
import { colors, spacing } from '../../../src/design/tokens';
import {
  getBookingById,
  getBookingPhotos,
  getRatingByBooking,
  getThreadByBooking,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import {
  updateBooking,
  updateRating,
  insertRating,
  insertKudos,
  insertMessageThread,
} from '../../../src/lib/supabase/mutations';
import {
  cancelBooking,
  proposeReschedule,
  provideCustomerInfo,
  respondAdjustment,
  respondReschedule,
} from '../../../src/lib/stripe';
import { appendLineItems } from '../../../supabase/functions/_shared/quote';
import { useAuthStore } from '../../../src/state/auth';
import {
  centsToDisplay,
  CUSTOMER_LATE_CANCEL_FEE_CENTS,
  calculateLateCancelFee,
  calculateLateCancelRefund,
} from '../../../src/utils/money';
import {
  formatDateTime,
  isWithin24Hours,
  isWithinDisputeWindow,
} from '../../../src/utils/date';
import {
  formatBookingReadyBy,
  formatDuration,
  resolveDurationMins,
} from '../../../src/utils/duration';
import type { BookingDetailParams } from '../../../src/types/navigation';
import type { ServiceSnapshot } from '../../../src/state/bookingDraft';
import type { ArrivalWindow, BookingPhoto, Rating } from '../../../src/types/models';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Booking money columns are stored as decimal dollars (NUMERIC); the
// money utilities operate in integer cents — convert before display.
function dollarsToCents(amount: number | null | undefined): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

function parseServicesSnapshot(value: unknown): ServiceSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? 'Service'),
      description: s.description == null ? null : String(s.description),
      category: String(s.category ?? ''),
      base_price: Number(s.base_price ?? 0),
      duration_mins:
        s.duration_mins == null ? null : Number(s.duration_mins),
    }));
}

const ACTIVE_FOR_TRACKING: BookingStatus[] = ['en_route', 'in_progress'];

// Unpriced: nothing has been charged, so cancelling costs nothing and the
// cancel sheet says so instead of talking about a deposit.
const UNPRICED_STATUSES: BookingStatus[] = [
  'pending_provider_quote',
  'pending_customer_approval',
  'awaiting_customer_info',
];

// Everything cancel_booking accepts from the customer (bookingPolicy.ts).
const CANCELLABLE_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'pending_adjustment_approval',
  ...UNPRICED_STATUSES,
];

// Where the customer may still add intake photos: while the provider has not
// priced the job, or has sent it back asking for more.
const PHOTO_STATUSES: BookingStatus[] = ['pending_provider_quote', 'awaiting_customer_info'];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BookingDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<BookingDetailParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const user = useAuthStore((s) => s.user);

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [photos, setPhotos] = useState<BookingPhoto[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Action sheets
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  // ─── Load ────────────────────────────────────────────────────────────

  const fetchBooking = useCallback(
    async (refresh = false) => {
      if (!id) return;
      if (!refresh) setIsLoading(true);
      setError(null);

      const [bookingRes, photosRes, ratingRes] = await Promise.all([
        getBookingById(id),
        getBookingPhotos(id),
        getRatingByBooking(id),
      ]);

      if (bookingRes.error) setError(bookingRes.error);
      else setBooking(bookingRes.data);

      if (!photosRes.error) setPhotos(photosRes.data ?? []);
      if (!ratingRes.error) setRating(ratingRes.data);

      setIsLoading(false);
    },
    [id],
  );

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBooking(true).finally(() => setIsRefreshing(false));
  }, [fetchBooking]);

  // ─── Derived ─────────────────────────────────────────────────────────

  const status = (booking?.status ?? 'pending') as BookingStatus;
  const services = useMemo(
    () => parseServicesSnapshot(booking?.services),
    [booking?.services],
  );
  // Prefers the provider-committed duration on the booking row, falling back
  // to the services snapshot for rows written before that column existed.
  const duration = useMemo(
    () => (booking ? resolveDurationMins(booking) : null),
    [booking],
  );
  const readyBy = useMemo(
    () => (booking ? formatBookingReadyBy(booking) : ''),
    [booking],
  );

  const providerName =
    booking?.provider_profiles?.users?.full_name ?? 'Provider';
  const providerAvatar = booking?.provider_profiles?.users?.avatar_url ?? null;
  const vehicle = booking?.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${
        vehicle.color ? ` · ${vehicle.color}` : ''
      }`
    : null;

  const canTrack = ACTIVE_FOR_TRACKING.includes(status);
  const canCancel = CANCELLABLE_STATUSES.includes(status);
  // Only a confirmed start is rescheduled by proposal; an unpriced request
  // changes its window instead, and nothing else has a start to move.
  const canReschedule = status === 'confirmed' && !booking?.proposed_scheduled_at;
  const isUnpriced = UNPRICED_STATUSES.includes(status);
  // cancelBooking waives the fee here (bookingPolicy.cancellationFeeApplies).
  const feeWaived = isUnpriced || status === 'pending' || status === 'pending_adjustment_approval';
  const withinForfeitWindow = booking && !feeWaived
    ? isWithin24Hours(booking.scheduled_at)
    : false;

  const intakePhotos = useMemo(
    () => photos.filter((p) => p.photo_type === 'intake'),
    [photos],
  );
  const jobPhotos = useMemo(
    () => photos.filter((p) => p.photo_type === 'before' || p.photo_type === 'after'),
    [photos],
  );
  const surcharges = useMemo(
    () => appendLineItems(booking?.quote_line_items, []),
    [booking?.quote_line_items],
  );

  const isCompleted = status === 'completed';
  const canRate = isCompleted && !rating;
  const completedAtIso =
    booking?.completed_at ?? rating?.created_at ?? null;
  const canDispute =
    isCompleted &&
    rating !== null &&
    !rating.is_flagged &&
    completedAtIso !== null &&
    isWithinDisputeWindow(completedAtIso);

  const providerUserId = booking?.provider_profiles?.users?.id ?? null;

  // Display amounts — DB stores NUMERIC dollars; convert to cents.
  const totalCents = dollarsToCents(booking?.total_amount);
  const depositCents = dollarsToCents(booking?.deposit_amount);
  const serviceFeeCents = dollarsToCents(booking?.service_fee);
  const balanceCents = Math.max(totalCents - depositCents, 0);

  // ─── Actions ─────────────────────────────────────────────────────────

  const handleTrack = useCallback(() => {
    if (!booking) return;
    router.push(`/bookings/tracking/${booking.id}`);
  }, [booking, router]);

  const handleMessage = useCallback(async () => {
    if (!booking || !user) return;
    setIsMutating(true);

    const existing = await getThreadByBooking(booking.id);
    if (existing.error) {
      setIsMutating(false);
      Alert.alert('Message Failed', existing.error.message);
      return;
    }

    let threadId = existing.data?.id ?? null;

    if (!threadId) {
      const created = await insertMessageThread({
        booking_id: booking.id,
        customer_id: booking.customer_id,
        provider_id: booking.provider_id,
      });
      if (created.error) {
        setIsMutating(false);
        Alert.alert('Message Failed', created.error.message);
        return;
      }
      threadId = created.data.id;
    }

    setIsMutating(false);
    router.push(`/inbox/${threadId}`);
  }, [booking, user, router]);

  // ─── Reschedule, by proposal ──────────────────────────────────────

  const handleProposeReschedule = useCallback(
    async (scheduledAt: string) => {
      if (!booking) return;
      setIsMutating(true);
      const { error: err } = await proposeReschedule(booking.id, scheduledAt);
      setIsMutating(false);
      if (err) {
        Alert.alert('Could Not Propose', err.message);
        return;
      }
      setShowRescheduleSheet(false);
      await fetchBooking(true);
    },
    [booking, fetchBooking],
  );

  const handleRespondReschedule = useCallback(
    async (accept: boolean) => {
      if (!booking) return;
      setIsMutating(true);
      const { error: err } = await respondReschedule(booking.id, accept);
      setIsMutating(false);
      if (err) Alert.alert('Could Not Update', err.message);
      await fetchBooking(true);
    },
    [booking, fetchBooking],
  );

  // ─── Adjustment ──────────────────────────────────────────────────

  const handleApproveAdjustment = useCallback(async () => {
    if (!booking) return;
    setIsMutating(true);
    const { error: err } = await respondAdjustment(booking.id, true);
    setIsMutating(false);
    if (err) Alert.alert('Could Not Approve', err.message);
    await fetchBooking(true);
  }, [booking, fetchBooking]);

  const handleDeclineAdjustment = useCallback(() => {
    if (!booking) return;
    Alert.alert(
      'Decline and cancel?',
      'Declining the change cancels this booking. Your deposit is refunded in full and no fee applies.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Decline & Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsMutating(true);
            const { error: err } = await respondAdjustment(booking.id, false);
            setIsMutating(false);
            if (err) Alert.alert('Could Not Decline', err.message);
            await fetchBooking(true);
          },
        },
      ],
    );
  }, [booking, fetchBooking]);

  // ─── More information ────────────────────────────────────────────

  const handleAddIntakePhoto = useCallback(
    async (photo: PickedPhoto) => {
      if (!booking) return;
      const { error: err } = await uploadIntakePhoto(booking.id, photo);
      if (err) {
        Alert.alert('Upload Failed', err.message);
        return;
      }
      const refreshed = await getBookingPhotos(booking.id);
      if (!refreshed.error) setPhotos(refreshed.data ?? []);
    },
    [booking],
  );

  // The window is the customer's to state (20260821000000 grants it), so a
  // provider who asked for another day gets it by a plain write.
  const handleChangeWindow = useCallback(
    async (window: ArrivalWindow) => {
      if (!booking) return;
      const { data, error: err } = await updateBooking(booking.id, {
        requested_window_start: window.start,
        requested_window_end: window.end,
      });
      if (err) {
        Alert.alert('Could Not Change Window', err.message);
        return;
      }
      if (data) setBooking((prev) => (prev ? { ...prev, ...data } : prev));
    },
    [booking],
  );

  const handleSendBack = useCallback(async () => {
    if (!booking) return;
    setIsMutating(true);
    const { error: err } = await provideCustomerInfo(booking.id);
    setIsMutating(false);
    if (err) {
      Alert.alert('Could Not Send', err.message);
      return;
    }
    await fetchBooking(true);
  }, [booking, fetchBooking]);

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    setIsMutating(true);

    // Cancellation policy is enforced server-side (Blocker #5): the Edge
    // Function transitions the booking, decides the 24h window, retains the
    // $15 flat fee if late, and issues the refund — all atomically. The
    // client never computes the refund amount.
    const { data, error: err } = await cancelBooking(booking.id);

    setIsMutating(false);
    setShowCancelSheet(false);

    if (err) {
      Alert.alert('Cancellation Failed', err.message);
      return;
    }

    // Reflect the new state locally without a refetch.
    setBooking((prev) =>
      prev
        ? {
            ...prev,
            status: 'cancelled',
            deposit_forfeited: Boolean(data?.late),
            cancelled_by: 'customer',
            cancellation_fee:
              data?.late ? calculateLateCancelFee(depositCents) / 100 : null,
          }
        : prev,
    );
  }, [booking, depositCents]);

  // ─── Rating submit (Flow 2.11) ───────────────────────────────────

  const handleRatingSubmit = useCallback(
    async (submission: ReviewSubmission) => {
      if (!booking || !user || !providerUserId) return;
      setIsMutating(true);

      const overall =
        (submission.ratings.quality +
          submission.ratings.timeliness +
          submission.ratings.communication +
          submission.ratings.value) /
        4;

      const ratingRes = await insertRating({
        booking_id: booking.id,
        reviewer_id: user.id,
        reviewee_id: providerUserId,
        quality_score: submission.ratings.quality,
        timeliness_score: submission.ratings.timeliness,
        communication_score: submission.ratings.communication,
        value_score: submission.ratings.value,
        overall_score: Number(overall.toFixed(2)),
        review_text: submission.reviewText.length > 0 ? submission.reviewText : null,
      });

      if (ratingRes.error) {
        setIsMutating(false);
        Alert.alert('Rating Failed', ratingRes.error.message);
        return;
      }

      // Insert one kudos row per selected badge (best-effort; individual
      // failures don't roll back the rating).
      await Promise.all(
        submission.kudos.map((badge) =>
          insertKudos({
            booking_id: booking.id,
            giver_id: user.id,
            receiver_id: providerUserId,
            badge: kudosToStorage(badge),
          }),
        ),
      );

      setRating(ratingRes.data);
      setShowReviewSheet(false);
      setIsMutating(false);
    },
    [booking, user, providerUserId],
  );

  // ─── Dispute (Flow 2.13) ─────────────────────────────────────────

  const handleDispute = useCallback(() => {
    if (!rating) return;
    Alert.alert(
      'Report this rating?',
      'Our team will review the booking and rating within 48 hours. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            setIsMutating(true);
            const { data, error: err } = await updateRating(rating.id, {
              is_flagged: true,
            });
            setIsMutating(false);
            if (err) {
              Alert.alert('Report Failed', err.message);
              return;
            }
            if (data) setRating(data);
            Alert.alert(
              'Reported',
              "Thanks — we'll be in touch if we need more info.",
            );
          },
        },
      ],
    );
  }, [rating]);

  // ─── Loading ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Booking' }} />
        <View
          style={[styles.centered, { backgroundColor: palette.offWhite }]}
        >
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  // ─── Error / not found ───────────────────────────────────────────────

  if (error || !booking) {
    return (
      <>
        <Stack.Screen options={{ title: 'Booking' }} />
        <View
          style={[styles.centered, { backgroundColor: palette.offWhite }]}
        >
          <Text variant="subheading" color="charcoal">
            Booking not found
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error?.message ??
              "We couldn't load this booking. It may have been removed."}
          </Text>
          <Spacer size="lg" />
          <Button
            label="Back to Bookings"
            variant="primary"
            onPress={() => router.replace('/bookings')}
          />
        </View>
      </>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Booking' }} />
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
          {/* Provider header */}
          <Pressable
            onPress={() =>
              booking.provider_id &&
              router.push(`/search/provider/${booking.provider_id}`)
            }
            accessibilityRole="button"
            accessibilityLabel={`Provider ${providerName}`}
            accessibilityHint="Tap to view provider profile"
          >
            <Card variant="elevated">
              <View style={styles.providerRow}>
                <Avatar uri={providerAvatar} name={providerName} size="md" />
                <View style={styles.providerInfo}>
                  <Text variant="label" color="midGray">
                    Provider
                  </Text>
                  <Text variant="subheading" color="charcoal" numberOfLines={1}>
                    {providerName}
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>

          <Spacer size="lg" />

          {/* The quote is waiting on the customer — this is the only place the
              approval screen is reachable from, and nothing moves until they
              act, so it sits above the status timeline rather than below it. */}
          {status === 'pending_customer_approval' && (
            <>
              <Card>
                <Text variant="label" color="charcoal">
                  Your price is ready
                </Text>
                <Spacer size="sm" />
                <Text variant="body" color="midGray">
                  {booking.provider_profiles?.users?.full_name ?? 'Your provider'}{' '}
                  has quoted this job. Nothing is charged until you approve it.
                </Text>
                <Spacer size="md" />
                <Button
                  label="Review Quote"
                  variant="primary"
                  onPress={() => router.push(`/bookings/quote/${booking.id}`)}
                />
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {/* An unpriced request: nothing to approve yet, and no charge has
              been made, so say so rather than showing an empty price. */}
          {status === 'pending_provider_quote' && (
            <>
              <Card>
                <Text variant="label" color="charcoal">
                  Waiting for your price
                </Text>
                <Spacer size="sm" />
                <Text variant="body" color="midGray">
                  {providerName} is reviewing your request. You have not been
                  charged.
                </Text>
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {/* §7 "photos unusable": the provider sent the request back. What
              they asked for, the tools to supply it, and the button that hands
              it back. Nothing moves until the customer taps it. */}
          {status === 'awaiting_customer_info' && (
            <>
              <Card>
                <Text variant="label" color="charcoal">
                  {providerName} needs a little more
                </Text>
                {booking.info_request_note ? (
                  <>
                    <Spacer size="sm" />
                    <Text variant="body" color="charcoal" testID="info-request-note">
                      “{booking.info_request_note}”
                    </Text>
                  </>
                ) : null}
                <Spacer size="sm" />
                <Text variant="caption" color="midGray">
                  Add photos or pick another time if they asked, then send it
                  back. You have not been charged.
                </Text>
                <Spacer size="md" />
                <ArrivalWindowPicker
                  value={
                    booking.requested_window_start && booking.requested_window_end
                      ? {
                          start: booking.requested_window_start,
                          end: booking.requested_window_end,
                        }
                      : null
                  }
                  onChange={handleChangeWindow}
                />
                <Spacer size="md" />
                <Button
                  label="Send Back to Provider"
                  variant="primary"
                  size="lg"
                  onPress={handleSendBack}
                  loading={isMutating}
                  testID="send-back-to-provider"
                />
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {/* Photos for the provider to price from. Addable while the request
              is with the provider or sent back; after that they are the basis
              of an agreed price and stay as they are. */}
          {PHOTO_STATUSES.includes(status) && (
            <>
              <Card variant="outlined">
                <IntakePhotoUploader
                  photos={intakePhotos.map((p) => ({ key: p.id, uri: p.storage_url }))}
                  onAdd={handleAddIntakePhoto}
                  disabled={isMutating}
                />
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {/* A change the provider proposed to a confirmed job. */}
          {status === 'pending_adjustment_approval' &&
            booking.adjustment_duration_mins != null &&
            booking.adjustment_total_amount != null && (
              <>
                <AdjustmentReviewCard
                  providerName={providerName}
                  reason={booking.adjustment_reason}
                  currentTotalCents={totalCents}
                  adjustedTotalCents={dollarsToCents(booking.adjustment_total_amount)}
                  currentDurationMins={booking.estimated_duration_mins}
                  adjustedDurationMins={booking.adjustment_duration_mins}
                  lines={appendLineItems(booking.adjustment_line_items, [])}
                  onApprove={handleApproveAdjustment}
                  onDecline={handleDeclineAdjustment}
                  busy={isMutating}
                />
                <Spacer size="lg" />
              </>
            )}

          {/* Approved, deposit submitted. For a quote-first booking the saved
              card was charged off-session; stripe-events confirms the booking
              when Stripe says it landed. Not "paid" — processing. */}
          {status === 'pending' && booking.quoted_total_amount != null && (
            <>
              <Card>
                <Text variant="label" color="charcoal">
                  Deposit processing
                </Text>
                <Spacer size="sm" />
                <Text variant="body" color="midGray">
                  You approved {providerName}&apos;s price. We&apos;ll confirm
                  your booking as soon as your bank does.
                </Text>
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {booking.proposed_scheduled_at && status === 'confirmed' && (
            <>
              <RescheduleProposalCard
                proposedAt={booking.proposed_scheduled_at}
                proposedByViewer={booking.reschedule_proposed_by === 'customer'}
                otherPartyLabel={providerName}
                onAccept={() => handleRespondReschedule(true)}
                onDecline={() => handleRespondReschedule(false)}
                onWithdraw={() => handleRespondReschedule(false)}
                busy={isMutating}
              />
              <Spacer size="lg" />
            </>
          )}

          {/* Status timeline */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Status
            </Text>
            <Spacer size="md" />
            <StatusTimeline status={status} />
            {status === 'cancelled' && booking.deposit_forfeited && (
              <>
                <Spacer size="sm" />
                <Text variant="caption" color="midGray">
                  A {centsToDisplay(CUSTOMER_LATE_CANCEL_FEE_CENTS)} late-cancellation
                  fee was retained; the remainder of the deposit was refunded.
                </Text>
              </>
            )}
          </Card>

          <Spacer size="lg" />

          {/* Booking details */}
          <Card variant="outlined">
            <Text variant="label" color="charcoal">
              Details
            </Text>
            <Spacer size="md" />

            <View style={styles.detailRow}>
              <Calendar
                size={16}
                color={palette.midGray}
                strokeWidth={2}
              />
              <View style={styles.detailText}>
                <Text variant="bodySmall" color="midGray">
                  Scheduled for
                </Text>
                <Text variant="body" color="charcoal">
                  {formatDateTime(booking.scheduled_at)}
                </Text>
                {duration != null && (
                  <Text variant="caption" color="midGray">
                    Est. {formatDuration(duration)}
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

            {booking.service_address && (
              <>
                <Spacer size="md" />
                <View style={styles.detailRow}>
                  <MapPin
                    size={16}
                    color={palette.midGray}
                    strokeWidth={2}
                  />
                  <View style={styles.detailText}>
                    <Text variant="bodySmall" color="midGray">
                      Service address
                    </Text>
                    <Text variant="body" color="charcoal">
                      {booking.service_address}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {booking.notes != null && booking.notes.length > 0 && (
              <>
                <Spacer size="md" />
                <Text variant="bodySmall" color="midGray">
                  Notes
                </Text>
                <Spacer size="xs" />
                <Text variant="body" color="charcoal">
                  {booking.notes}
                </Text>
              </>
            )}
          </Card>

          <Spacer size="lg" />

          {/* Before/after photos (Flow 2.10). Intake photos are shown in their
              own card above while they can still change. */}
          {jobPhotos.length > 0 && (
            <>
              <BookingPhotoGallery photos={jobPhotos} />
              <Spacer size="lg" />
            </>
          )}

          {/* Existing rating (Flow 2.11) */}
          {rating && (
            <>
              <Card variant="outlined">
                <Text variant="label" color="charcoal">
                  Your rating
                </Text>
                <Spacer size="md" />
                <GearRating
                  values={{
                    quality: rating.quality_score ?? 0,
                    timeliness: rating.timeliness_score ?? 0,
                    communication: rating.communication_score ?? 0,
                    value: rating.value_score ?? 0,
                  }}
                  size="sm"
                />
                {rating.review_text && (
                  <>
                    <Spacer size="md" />
                    <Text variant="body" color="charcoal">
                      {rating.review_text}
                    </Text>
                  </>
                )}
                {rating.is_flagged && (
                  <>
                    <Spacer size="md" />
                    <Text variant="caption" color="midGray">
                      This rating has been flagged for review.
                    </Text>
                  </>
                )}
              </Card>
              <Spacer size="lg" />
            </>
          )}

          {/* Price breakdown */}
          {services.length > 0 && (
            <>
              <PriceBreakdown
                services={services}
                serviceFeeCents={serviceFeeCents}
                totalCents={totalCents}
                surcharges={surcharges}
              />
              <Spacer size="lg" />
            </>
          )}

          {/* Deposit summary. Not for an unpriced request: its deposit_amount
              is derived from the advertised price and is not what will be
              charged — the quote decides that. */}
          {!isUnpriced && (
            <DepositSummary
              totalCents={totalCents}
              depositCents={depositCents}
              balanceCents={balanceCents}
            />
          )}

          <Spacer size="xl" />

          {/* Booking ID — useful for support */}
          <Text variant="caption" color="midGray" style={styles.bookingId}>
            Booking ID: {booking.id}
          </Text>

          <Spacer size={120} />
        </ScrollView>

        {/* Sticky action footer */}
        <SafeAreaView edges={['bottom']} style={styles.stickyFooter}>
          <View
            style={[
              styles.footerInner,
              {
                backgroundColor: palette.offWhite,
                borderTopColor: isDark ? '#2A2A3E' : '#E5E7EB',
              },
            ]}
          >
            {canTrack && (
              <>
                <Button
                  label="Track Provider"
                  variant="primary"
                  size="lg"
                  onPress={handleTrack}
                  leftIcon={
                    <Navigation
                      size={18}
                      color={palette.offWhite}
                      strokeWidth={2}
                    />
                  }
                />
                <Spacer size="sm" />
              </>
            )}

            {canRate && (
              <>
                <Button
                  label="Rate Provider"
                  variant="primary"
                  size="lg"
                  onPress={() => setShowReviewSheet(true)}
                  leftIcon={
                    <Star
                      size={18}
                      color={palette.offWhite}
                      strokeWidth={2}
                    />
                  }
                />
                <Spacer size="sm" />
              </>
            )}

            <View style={styles.actionRow}>
              <Button
                label="Message"
                variant="secondary"
                size="md"
                onPress={handleMessage}
                loading={isMutating}
                leftIcon={
                  <MessageCircle
                    size={16}
                    color={palette.deepIndigo}
                    strokeWidth={2}
                  />
                }
                style={styles.actionButton}
              />
              {canReschedule && (
                <Button
                  label="Reschedule"
                  variant="secondary"
                  size="md"
                  onPress={() => setShowRescheduleSheet(true)}
                  leftIcon={
                    <CalendarClock
                      size={16}
                      color={palette.deepIndigo}
                      strokeWidth={2}
                    />
                  }
                  style={styles.actionButton}
                />
              )}
            </View>

            {canCancel && (
              <>
                <Spacer size="sm" />
                <Button
                  label={isUnpriced ? 'Cancel Request' : 'Cancel Booking'}
                  variant="ghost"
                  size="md"
                  onPress={() => setShowCancelSheet(true)}
                  leftIcon={
                    <XCircle
                      size={16}
                      color={palette.midGray}
                      strokeWidth={2}
                    />
                  }
                />
              </>
            )}

            {canDispute && (
              <>
                <Spacer size="sm" />
                <Button
                  label="Report an Issue"
                  variant="ghost"
                  size="md"
                  onPress={handleDispute}
                  leftIcon={
                    <Flag
                      size={16}
                      color={palette.midGray}
                      strokeWidth={2}
                    />
                  }
                />
              </>
            )}
          </View>
        </SafeAreaView>

        {/* Cancel confirmation sheet */}
        <Sheet
          visible={showCancelSheet}
          onClose={() => setShowCancelSheet(false)}
          title="Cancel Booking"
        >
          <View>
            {isUnpriced ? (
              <Text variant="body" color="charcoal">
                Nothing has been charged, so cancelling this request is free.
              </Text>
            ) : status === 'pending_adjustment_approval' ? (
              <Text variant="body" color="charcoal">
                {providerName} proposed a change you have not answered, so
                cancelling now is free — your{' '}
                {centsToDisplay(depositCents)} deposit is refunded in full.
              </Text>
            ) : withinForfeitWindow ? (
              <View style={styles.warningRow}>
                <AlertTriangle
                  size={20}
                  color={palette.gearGold}
                  strokeWidth={2}
                />
                <Text
                  variant="body"
                  color="charcoal"
                  style={styles.warningText}
                >
                  This booking is within 24 hours. A{' '}
                  {centsToDisplay(calculateLateCancelFee(depositCents))} late-cancellation
                  fee applies; the remaining{' '}
                  {centsToDisplay(calculateLateCancelRefund(depositCents))} of your{' '}
                  {centsToDisplay(depositCents)} deposit will be refunded.
                </Text>
              </View>
            ) : (
              <Text variant="body" color="charcoal">
                You can cancel for free — the {centsToDisplay(depositCents)}{' '}
                deposit will be refunded in full.
              </Text>
            )}

            <Spacer size="lg" />

            <Button
              label="Confirm Cancellation"
              variant="danger"
              size="lg"
              onPress={handleCancel}
              loading={isMutating}
            />
            <Spacer size="sm" />
            <Button
              label="Keep Booking"
              variant="ghost"
              size="md"
              onPress={() => setShowCancelSheet(false)}
              disabled={isMutating}
            />
          </View>
        </Sheet>

        {/* Reschedule sheet — proposes; the provider has to accept */}
        <RescheduleSheet
          visible={showRescheduleSheet}
          onClose={() => setShowRescheduleSheet(false)}
          currentScheduledAt={booking.scheduled_at}
          otherPartyLabel={providerName}
          onSubmit={handleProposeReschedule}
          submitting={isMutating}
        />

        {/* Review / rating sheet (Flow 2.11) */}
        <ReviewSheet
          visible={showReviewSheet}
          onClose={() => setShowReviewSheet(false)}
          onSubmit={handleRatingSubmit}
          providerName={providerName}
          submitting={isMutating}
        />
      </View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  centeredText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  scroll: {
    padding: spacing.base,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  providerInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailText: {
    flex: 1,
    gap: spacing.xs,
  },
  bookingId: {
    fontFamily: 'JetBrainsMono',
    textAlign: 'center',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerInner: {
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
  },
});
