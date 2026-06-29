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
import { DateTimePicker } from '../../../src/components/booking/DateTimePicker';
import { StatusTimeline } from '../../../src/components/booking/StatusTimeline';
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
import { cancelBooking } from '../../../src/lib/stripe';
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
import type { BookingDetailParams } from '../../../src/types/navigation';
import type { ServiceSnapshot } from '../../../src/state/bookingDraft';
import type { BookingPhoto, Rating } from '../../../src/types/models';

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

function totalDurationMins(services: ServiceSnapshot[]): number {
  return services.reduce((sum, s) => sum + (s.duration_mins ?? 0), 0);
}

function formatDuration(mins: number): string {
  if (mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

const ACTIVE_FOR_TRACKING: BookingStatus[] = ['en_route', 'in_progress'];
const EDITABLE_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

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
  const [rescheduleAt, setRescheduleAt] = useState<string | null>(null);
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
  const duration = useMemo(() => totalDurationMins(services), [services]);

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
  const canEdit = EDITABLE_STATUSES.includes(status);
  const withinForfeitWindow = booking
    ? isWithin24Hours(booking.scheduled_at)
    : false;

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

  const openReschedule = useCallback(() => {
    setRescheduleAt(booking?.scheduled_at ?? null);
    setShowRescheduleSheet(true);
  }, [booking?.scheduled_at]);

  const handleReschedule = useCallback(async () => {
    if (!booking || !rescheduleAt) return;
    setIsMutating(true);

    const { data, error: err } = await updateBooking(booking.id, {
      scheduled_at: rescheduleAt,
    });

    setIsMutating(false);
    setShowRescheduleSheet(false);

    if (err) {
      Alert.alert('Reschedule Failed', err.message);
      return;
    }

    if (data) setBooking((prev) => (prev ? { ...prev, ...data } : prev));
  }, [booking, rescheduleAt]);

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
                {duration > 0 && (
                  <Text variant="caption" color="midGray">
                    Est. {formatDuration(duration)}
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

          {/* Before/after photos (Flow 2.10) */}
          {photos.length > 0 && (
            <>
              <BookingPhotoGallery photos={photos} />
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
              />
              <Spacer size="lg" />
            </>
          )}

          {/* Deposit summary */}
          <DepositSummary
            totalCents={totalCents}
            depositCents={depositCents}
            balanceCents={balanceCents}
          />

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
              {canEdit && (
                <Button
                  label="Reschedule"
                  variant="secondary"
                  size="md"
                  onPress={openReschedule}
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

            {canEdit && (
              <>
                <Spacer size="sm" />
                <Button
                  label="Cancel Booking"
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
            {withinForfeitWindow ? (
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

        {/* Reschedule sheet */}
        <Sheet
          visible={showRescheduleSheet}
          onClose={() => setShowRescheduleSheet(false)}
          title="Reschedule"
        >
          <View>
            <DateTimePicker
              value={rescheduleAt}
              onChange={setRescheduleAt}
            />
            <Spacer size="lg" />
            <Button
              label="Save New Time"
              variant="primary"
              size="lg"
              onPress={handleReschedule}
              loading={isMutating}
              disabled={
                !rescheduleAt || rescheduleAt === booking.scheduled_at
              }
            />
            <Spacer size="sm" />
            <Button
              label="Cancel"
              variant="ghost"
              size="md"
              onPress={() => setShowRescheduleSheet(false)}
              disabled={isMutating}
            />
          </View>
        </Sheet>

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
