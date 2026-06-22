// Provider active-job screen (Flows 5.4 / 5.5 / 5.6).
//
// Reached from the Bookings tab "My Jobs" toggle. Shows the job from the
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Text } from '../../../../src/components/ui/Text';
import { Button } from '../../../../src/components/ui/Button';
import { Card } from '../../../../src/components/ui/Card';
import { Avatar } from '../../../../src/components/ui/Avatar';
import { Spacer } from '../../../../src/components/ui/Spacer';
import { StatusTimeline } from '../../../../src/components/booking/StatusTimeline';
import { JobPhotoCapture } from '../../../../src/components/provider/JobPhotoCapture';
import type { BookingStatus } from '../../../../src/components/booking/StatusTimeline';
import { colors, spacing } from '../../../../src/design/tokens';
import {
  getProviderJobById,
  getBookingPhotos,
  getThreadByBooking,
  type ProviderJobSummary,
} from '../../../../src/lib/supabase/queries';
import { updateBooking, insertMessageThread } from '../../../../src/lib/supabase/mutations';
import {
  captureBalance,
  acceptBooking,
  declineBooking,
  providerCancelBooking,
  markNoShow,
} from '../../../../src/lib/stripe';
import { sendProviderLocation } from '../../../../src/lib/location/tracking';
import { useAuthStore } from '../../../../src/state/auth';
import { centsToDisplay } from '../../../../src/utils/money';
import { formatDateTime } from '../../../../src/utils/date';
import type { ProviderJobParams } from '../../../../src/types/navigation';
import type { BookingPhoto } from '../../../../src/types/models';

// Minimum before/after photos before a job can be completed (CLAUDE.md / Flow 5.5).
const MIN_PHOTOS_TO_COMPLETE = 4;
const GPS_INTERVAL_MS = 5_000;
const ACTIVE_STATUSES: BookingStatus[] = ['en_route', 'in_progress'];

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

  const handleComplete = useCallback(() => {
    if (!job) return;
    if (photos.length < MIN_PHOTOS_TO_COMPLETE) {
      Alert.alert(
        'Add more photos',
        `Capture at least ${MIN_PHOTOS_TO_COMPLETE} before/after photos before completing the job.`,
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
            Alert.alert('Job complete', 'Payment captured and your payout is queued.');
          },
        },
      ],
    );
  }, [job, photos.length, fetchJob]);

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
    router.push(`/inbox/${threadId}`);
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
                : `Add at least ${MIN_PHOTOS_TO_COMPLETE} to complete the job (${photos.length}/${MIN_PHOTOS_TO_COMPLETE}).`}
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
                <Button
                  label="Start Travel"
                  variant="primary"
                  size="lg"
                  loading={isMutating}
                  onPress={handleStartTravel}
                  leftIcon={<Truck size={18} color={palette.offWhite} strokeWidth={2} />}
                  testID="job-start-travel"
                />
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
