// Live tracking screen — opened from the booking detail's "Track Provider"
// CTA when status is en_route or in_progress. Renders the LiveMap with the
// provider's pin moving toward the customer's service address, a top status
// bar, and a bottom ETA card. Polls provider_location_cache every 5s per
// CLAUDE.md (Postgres polling; live GPS writes go through Redis on the
// provider side, which is out of scope for the customer view).
//
// If the booking transitions out of an active state (completed/cancelled)
// the screen short-circuits to a closing message and the customer can
// return to the booking detail.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';
import { Text } from '../../../../src/components/ui/Text';
import { Button } from '../../../../src/components/ui/Button';
import { Spacer } from '../../../../src/components/ui/Spacer';
import { LiveMap } from '../../../../src/components/tracking/LiveMap';
import { JobStatusBar } from '../../../../src/components/tracking/JobStatusBar';
import { ETADisplay } from '../../../../src/components/tracking/ETADisplay';
import type { BookingStatus } from '../../../../src/components/booking/StatusTimeline';
import { colors, spacing } from '../../../../src/design/tokens';
import {
  getBookingById,
  getProviderLocation,
  getThreadByBooking,
  type BookingSummary,
} from '../../../../src/lib/supabase/queries';
import { insertMessageThread } from '../../../../src/lib/supabase/mutations';
import {
  distanceMiles,
  estimateEtaMinutes,
  type LatLng,
} from '../../../../src/lib/location';
import type { BookingTrackingParams } from '../../../../src/types/navigation';

// ─── Constants ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;
const ACTIVE_STATUSES: BookingStatus[] = ['en_route', 'in_progress'];

interface ProviderFix {
  position: LatLng;
  updatedAt: string;
}

// ─── Screen ────────────────────────────────────────────────────────────

export default function TrackingScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<BookingTrackingParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [providerFix, setProviderFix] = useState<ProviderFix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Refs avoid re-triggering polling effect on every state change.
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerIdRef = useRef<string | null>(null);

  // ─── Load booking once ───────────────────────────────────────────

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    setIsLoading(true);
    setError(null);

    const { data, error: err } = await getBookingById(bookingId);
    if (err) {
      setError(err);
      setIsLoading(false);
      return;
    }

    setBooking(data);
    providerIdRef.current = data.provider_id;
    setIsLoading(false);
  }, [bookingId]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  // ─── Poll provider location while active ─────────────────────────

  const pollProvider = useCallback(async () => {
    const providerId = providerIdRef.current;
    if (!providerId) return;

    const { data, error: err } = await getProviderLocation(providerId);
    if (err || !data) return;
    setProviderFix({
      position: {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      },
      updatedAt: data.updated_at ?? new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    if (!booking) return;
    const isActive = ACTIVE_STATUSES.includes(booking.status as BookingStatus);
    if (!isActive) return;

    // Immediate first fetch, then poll on interval.
    pollProvider();
    pollIntervalRef.current = setInterval(pollProvider, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [booking?.id, booking?.status, pollProvider]);

  // ─── Derived ─────────────────────────────────────────────────────

  const status = (booking?.status ?? 'pending') as BookingStatus;
  const providerName =
    booking?.provider_profiles?.users?.full_name ?? 'Provider';

  const destination: LatLng | null =
    booking?.location_lat != null && booking?.location_lng != null
      ? {
          latitude: Number(booking.location_lat),
          longitude: Number(booking.location_lng),
        }
      : null;

  const distance =
    providerFix && destination
      ? distanceMiles(providerFix.position, destination)
      : null;

  const eta =
    providerFix && destination
      ? estimateEtaMinutes(providerFix.position, destination)
      : null;

  // ─── Message handler ─────────────────────────────────────────────

  const handleMessage = useCallback(async () => {
    if (!booking) return;
    const existing = await getThreadByBooking(booking.id);
    let threadId = existing.data?.id ?? null;

    if (!threadId) {
      const created = await insertMessageThread({
        booking_id: booking.id,
        customer_id: booking.customer_id,
        provider_id: booking.provider_id,
      });
      if (created.error) return;
      threadId = created.data.id;
    }
    router.push(`/inbox/${threadId}`);
  }, [booking, router]);

  // ─── Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={[styles.centered, { backgroundColor: palette.offWhite }]}
        >
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  // ─── Error / not found ───────────────────────────────────────────

  if (error || !booking) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView
          style={[styles.centered, { backgroundColor: palette.offWhite }]}
        >
          <Text variant="subheading" color="charcoal">
            Tracking unavailable
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error?.message ?? 'Booking not found.'}
          </Text>
          <Spacer size="lg" />
          <Button
            label="Back to Booking"
            variant="primary"
            onPress={() => router.back()}
          />
        </SafeAreaView>
      </>
    );
  }

  // ─── No destination (booking missing lat/lng) ────────────────────

  if (!destination) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView
          style={[styles.centered, { backgroundColor: palette.offWhite }]}
        >
          <Text variant="subheading" color="charcoal">
            Service address not on map
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            We don't have map coordinates for this booking's service address.
          </Text>
          <Spacer size="lg" />
          <Button
            label="Back to Booking"
            variant="primary"
            onPress={() => router.back()}
          />
        </SafeAreaView>
      </>
    );
  }

  // ─── Inactive booking (completed/cancelled/pending/confirmed) ────

  const isActive = ACTIVE_STATUSES.includes(status);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <LiveMap
          destination={destination}
          providerPosition={providerFix?.position ?? null}
        />

        {/* Top overlay: back button + status bar */}
        <SafeAreaView
          edges={['top']}
          style={styles.topOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.topRow} pointerEvents="box-none">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back to booking"
              hitSlop={10}
              style={[
                styles.backButton,
                { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
              ]}
            >
              <ChevronLeft
                size={22}
                color={palette.charcoal}
                strokeWidth={2.5}
              />
            </Pressable>

            <View style={styles.statusBarWrap}>
              <JobStatusBar status={status} providerName={providerName} />
            </View>
          </View>
        </SafeAreaView>

        {/* Bottom overlay: ETA + message CTA */}
        <SafeAreaView
          edges={['bottom']}
          style={styles.bottomOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.bottomInner}>
            {isActive ? (
              <ETADisplay
                etaMinutes={eta}
                distanceMiles={distance}
                lastUpdatedAt={providerFix?.updatedAt ?? null}
              />
            ) : (
              <View
                style={[
                  styles.inactiveCard,
                  { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
                ]}
              >
                <Text variant="label" color="charcoal">
                  Provider isn't on the way yet
                </Text>
                <Spacer size="xs" />
                <Text variant="caption" color="midGray">
                  Tracking starts when the provider begins traveling to you.
                </Text>
              </View>
            )}

            <Spacer size="sm" />

            <Button
              label="Message Provider"
              variant="secondary"
              size="md"
              onPress={handleMessage}
              leftIcon={
                <MessageCircle
                  size={16}
                  color={palette.deepIndigo}
                  strokeWidth={2}
                />
              }
            />
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

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
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  statusBarWrap: {
    flex: 1,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomInner: {
    padding: spacing.base,
  },
  inactiveCard: {
    padding: spacing.base,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});
