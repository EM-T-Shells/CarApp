// Past bookings — history view for completed and cancelled bookings.
// Mirrors the upcoming-bookings list layout (Card per row with provider,
// date, vehicle, status pill, total) but adds a "Book Again" CTA that
// routes back into the booking flow for the same provider, so customers
// can re-engage their favourite providers with one tap.

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore, selectIsProvider } from '../../../src/state/auth';
import {
  getPastBookingsForCustomer,
  getPastBookingsForProvider,
  getProviderByUserId,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import { centsToDisplay } from '../../../src/utils/money';
import { formatShortDate, formatTime } from '../../../src/utils/date';

// ── Types ──────────────────────────────────────────────────────────────

type ViewMode = 'customer' | 'provider';

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
  palette: (typeof colors)['light'];
  viewMode: ViewMode;
  onPress: () => void;
  onRebook: () => void;
}

function PastBookingCard({
  booking,
  palette,
  viewMode,
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

  const canRebook =
    viewMode === 'customer' &&
    booking.status === 'completed' &&
    !!booking.provider_id;

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
  const isProvider = useAuthStore(selectIsProvider);

  const [viewMode, setViewMode] = useState<ViewMode>('customer');
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const providerIdRef = useRef<string | null>(null);

  const fetchBookings = useCallback(
    async (mode: ViewMode, refresh = false) => {
      if (!user) return;
      if (!refresh) setIsLoading(true);
      setError(null);

      if (mode === 'provider') {
        if (!providerIdRef.current) {
          const { data: profile, error: profileError } =
            await getProviderByUserId(user.id);
          if (profileError || !profile) {
            setError(profileError ?? new Error('Provider profile not found'));
            setIsLoading(false);
            return;
          }
          providerIdRef.current = profile.id;
        }
        const { data, error: err } = await getPastBookingsForProvider(
          providerIdRef.current,
        );
        if (err) setError(err);
        else setBookings(data ?? []);
      } else {
        const { data, error: err } = await getPastBookingsForCustomer(
          user.id,
        );
        if (err) setError(err);
        else setBookings(data ?? []);
      }

      setIsLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchBookings(viewMode);
  }, [viewMode, fetchBookings]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBookings(viewMode, true).finally(() => setIsRefreshing(false));
  }, [viewMode, fetchBookings]);

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
        viewMode={viewMode}
        onPress={() => handleBookingPress(item.id)}
        onRebook={() => {
          if (item.provider_id) handleRebook(item.provider_id);
        }}
      />
    ),
    [palette, viewMode, handleBookingPress, handleRebook],
  );

  const keyExtractor = useCallback((item: BookingSummary) => item.id, []);

  const tabToggle = isProvider ? (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.04)',
        },
      ]}
    >
      <Pressable
        style={[
          styles.tab,
          viewMode === 'customer' && { backgroundColor: palette.deepIndigo },
        ]}
        onPress={() => setViewMode('customer')}
        accessibilityRole="tab"
        accessibilityLabel="Past bookings as customer"
        accessibilityState={{ selected: viewMode === 'customer' }}
      >
        <Text
          variant="label"
          style={{ color: viewMode === 'customer' ? '#FFFFFF' : palette.midGray }}
        >
          My Bookings
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.tab,
          viewMode === 'provider' && { backgroundColor: palette.deepIndigo },
        ]}
        onPress={() => setViewMode('provider')}
        accessibilityRole="tab"
        accessibilityLabel="Past jobs as provider"
        accessibilityState={{ selected: viewMode === 'provider' }}
      >
        <Text
          variant="label"
          style={{ color: viewMode === 'provider' ? '#FFFFFF' : palette.midGray }}
        >
          My Jobs
        </Text>
      </Pressable>
    </View>
  ) : null;

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        {tabToggle}
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
        {tabToggle}
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
            onPress={() => fetchBookings(viewMode)}
          />
        </View>
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────

  if (bookings.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        {tabToggle}
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
            {viewMode === 'provider'
              ? "You haven't completed any jobs yet. Past work will show here."
              : "You haven't completed any bookings yet. Find a provider to get started."}
          </Text>
          {viewMode === 'customer' && (
            <>
              <Spacer size="lg" />
              <Button
                label="Find a Provider"
                variant="primary"
                size="md"
                onPress={() => router.push('/(tabs)/search')}
              />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── List ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      {tabToggle}
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
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 10,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
