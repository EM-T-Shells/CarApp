// Past bookings — history view for completed and cancelled bookings.
// Mirrors the upcoming-bookings list layout (Card per row with provider,
// date, vehicle, status pill, total) but adds a "Book Again" CTA that
// routes back into the booking flow for the same provider, so customers
// can re-engage their favourite providers with one tap.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Archive, RotateCcw, Car, Clock } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing, type Palette } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getPastBookingsForCustomer,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import { centsToDisplay } from '../../../src/utils/money';
import { formatShortDate, formatTime } from '../../../src/utils/date';

// ── Types ──────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  colorKey: keyof typeof colors.light;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  completed: { label: 'Completed', colorKey: 'emeraldGreen' },
  cancelled: { label: 'Cancelled', colorKey: 'midGray' },
  no_show: { label: 'No-Show', colorKey: 'midGray' },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? STATUS_MAP['completed'];
}

// ── PastBookingCard ─────────────────────────────────────────────────────

interface PastBookingCardProps {
  booking: BookingSummary;
  palette: Palette;
  onPress: () => void;
  onRebook: () => void;
}

function PastBookingCard({
  booking,
  palette,
  onPress,
  onRebook,
}: PastBookingCardProps): React.ReactElement {
  const providerName =
    booking.provider_profiles?.users?.full_name ?? 'Provider';
  const providerAvatar = booking.provider_profiles?.users?.avatar_url;
  const vehicle = booking.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  const { label: statusLabel, colorKey } = getStatusConfig(booking.status);
  const statusColor = palette[colorKey];

  const canRebook = booking.status === 'completed' && !!booking.provider_id;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${statusLabel} booking on ${formatShortDate(booking.scheduled_at)} with ${providerName}`}
      accessibilityHint="Tap to view booking details"
    >
      <View style={cardStyles.row}>
        <Avatar uri={providerAvatar} name={providerName} size="sm" />
        <Spacer size="sm" horizontal />
        <Text
          variant="label"
          color="charcoal"
          numberOfLines={1}
          style={cardStyles.flex}
        >
          {providerName}
        </Text>
        <View
          style={[
            cardStyles.statusPill,
            { backgroundColor: statusColor + '22' },
          ]}
        >
          <Text variant="caption" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Spacer size="sm" />

      <View style={cardStyles.row}>
        <Clock size={13} color={palette.midGray} strokeWidth={2} />
        <Spacer size="xs" horizontal />
        <Text variant="bodySmall" color="midGray">
          {formatShortDate(booking.scheduled_at)} ·{' '}
          {formatTime(booking.scheduled_at)}
        </Text>
      </View>

      {vehicleLabel && (
        <>
          <Spacer size="xs" />
          <View style={cardStyles.row}>
            <Car size={13} color={palette.midGray} strokeWidth={2} />
            <Spacer size="xs" horizontal />
            <Text variant="caption" color="midGray" numberOfLines={1}>
              {vehicleLabel}
            </Text>
          </View>
        </>
      )}

      <Spacer size="sm" />

      <View style={cardStyles.row}>
        {booking.total_amount != null && (
          <Text variant="price" color="charcoal">
            {centsToDisplay(Math.round(booking.total_amount * 100))}
          </Text>
        )}
        <Spacer flex />
        {canRebook && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onRebook();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Book ${providerName} again`}
            style={({ pressed }) => [
              cardStyles.rebookButton,
              { borderColor: palette.electricBlue },
              pressed && cardStyles.pressed,
            ]}
          >
            <RotateCcw
              size={14}
              color={palette.electricBlue}
              strokeWidth={2}
            />
            <Text variant="label" style={{ color: palette.electricBlue }}>
              Book Again
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const cardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginLeft: spacing.sm,
  },
  rebookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    minHeight: 36,
  },
  pressed: {
    opacity: 0.6,
  },
});

// ── Screen ──────────────────────────────────────────────────────────────

export default function PastBookingsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);

  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBookings = useCallback(
    async (refresh = false) => {
      if (!user) return;
      if (!refresh) setIsLoading(true);
      setError(null);

      const { data, error: err } = await getPastBookingsForCustomer(user.id);
      if (err) setError(err);
      else setBookings(data ?? []);

      setIsLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBookings(true).finally(() => setIsRefreshing(false));
  }, [fetchBookings]);

  const handleBookingPress = useCallback(
    (bookingId: string) => {
      router.push(`/bookings/${bookingId}`);
    },
    [router],
  );

  const handleRebook = useCallback(
    (providerId: string) => {
      router.push(`/search/book/${providerId}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: BookingSummary }) => (
      <PastBookingCard
        booking={item}
        palette={palette}
        onPress={() => handleBookingPress(item.id)}
        onRebook={() => {
          if (item.provider_id) handleRebook(item.provider_id);
        }}
      />
    ),
    [palette, handleBookingPress, handleRebook],
  );

  const keyExtractor = useCallback((item: BookingSummary) => item.id, []);

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <View style={styles.centered}>
          <Text variant="subheading" color="charcoal">
            Something went wrong
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error.message}
          </Text>
          <Spacer size="lg" />
          <Button
            label="Retry"
            variant="primary"
            size="md"
            onPress={() => fetchBookings()}
          />
        </View>
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────

  if (bookings.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={palette.electricBlue}
            />
          }
        >
          <Archive size={48} color={palette.midGray} strokeWidth={1.5} />
          <Spacer size="md" />
          <Text variant="subheading" color="charcoal">
            No past bookings
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            You haven&apos;t completed any bookings yet. Find a provider to get
            started.
          </Text>
          <Spacer size="lg" />
          <Button
            label="Find a Provider"
            variant="primary"
            size="md"
            onPress={() => router.push('/(tabs)/search')}
          />
        </ScrollView>
      </View>
    );
  }

  // ── List ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      <FlatList
        data={bookings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="md" />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.electricBlue}
          />
        }
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

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
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
