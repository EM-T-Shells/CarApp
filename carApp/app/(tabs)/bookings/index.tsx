// Upcoming bookings list — shows pending/confirmed/en_route/in_progress
// bookings for the authenticated user. Providers with role 'both' or
// 'provider' see a tab switcher to toggle between customer bookings and
// provider jobs. Handles loading, empty, and error states per convention.

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
import {
  CalendarX,
  ChevronRight,
  Clock,
  Car,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore, selectIsProvider } from '../../../src/state/auth';
import {
  getUpcomingBookingsForCustomer,
  getUpcomingBookingsForProvider,
  getProviderByUserId,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import { centsToDisplay } from '../../../src/utils/money';
import { formatShortDate, formatTime } from '../../../src/utils/date';

// ── Types ──────────────────────────────────────────────────────────────

type ViewMode = 'customer' | 'provider';

// ── Status config ──────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  colorKey: keyof typeof colors.light;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  pending: { label: 'Pending', colorKey: 'midGray' },
  confirmed: { label: 'Confirmed', colorKey: 'electricBlue' },
  en_route: { label: 'En Route', colorKey: 'gearGold' },
  in_progress: { label: 'In Progress', colorKey: 'emeraldGreen' },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? STATUS_MAP['pending'];
}

// ── BookingCard ────────────────────────────────────────────────────────

interface BookingCardProps {
  booking: BookingSummary;
  onPress: () => void;
  palette: (typeof colors)['light'];
}

function BookingCard({
  booking,
  onPress,
  palette,
}: BookingCardProps): React.ReactElement {
  const providerName =
    booking.provider_profiles?.users?.full_name ?? 'Awaiting provider';
  const providerAvatar = booking.provider_profiles?.users?.avatar_url;
  const vehicle = booking.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  const { label: statusLabel, colorKey } = getStatusConfig(booking.status);
  const statusColor = palette[colorKey];

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Booking on ${formatShortDate(booking.scheduled_at)} with ${providerName}`}
      accessibilityHint="Tap to view booking details"
    >
      {/* Provider + status row */}
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

      {/* Date + time */}
      <View style={cardStyles.row}>
        <Clock
          size={13}
          color={palette.midGray}
          strokeWidth={2}
        />
        <Spacer size="xs" horizontal />
        <Text variant="bodySmall" color="midGray">
          {formatShortDate(booking.scheduled_at)} ·{' '}
          {formatTime(booking.scheduled_at)}
        </Text>
      </View>

      {/* Vehicle */}
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

      {/* Footer: total + chevron */}
      <View style={cardStyles.row}>
        {booking.total_amount != null && (
          <Text variant="price" color="charcoal">
            {centsToDisplay(booking.total_amount)}
          </Text>
        )}
        <Spacer flex />
        <ChevronRight size={18} color={palette.midGray} strokeWidth={2} />
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
});

// ── Screen ─────────────────────────────────────────────────────────────

export default function BookingsScreen(): React.ReactElement {
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

  // Cache the provider profile ID after the first lookup so we don't
  // re-query provider_profiles every time the user switches tabs.
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
        const { data, error: err } = await getUpcomingBookingsForProvider(
          providerIdRef.current,
        );
        if (err) setError(err);
        else setBookings(data ?? []);
      } else {
        const { data, error: err } = await getUpcomingBookingsForCustomer(
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

  const renderItem = useCallback(
    ({ item }: { item: BookingSummary }) => (
      <BookingCard
        booking={item}
        palette={palette}
        onPress={() => handleBookingPress(item.id)}
      />
    ),
    [palette, handleBookingPress],
  );

  const keyExtractor = useCallback((item: BookingSummary) => item.id, []);

  // ── Tab toggle (shared between loading/loaded states) ──────────────

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
        accessibilityLabel="My bookings as customer"
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
        accessibilityLabel="My jobs as provider"
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
        <View style={styles.header}>
          <Text variant="heading" color="charcoal">
            Bookings
          </Text>
        </View>
        {tabToggle}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
          <Spacer size="md" />
          <Text variant="body" color="midGray">
            Loading bookings...
          </Text>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <View style={styles.header}>
          <Text variant="heading" color="charcoal">
            Bookings
          </Text>
        </View>
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
        <View
          style={[
            styles.header,
            {
              borderBottomWidth: 1,
              borderBottomColor: isDark
                ? 'rgba(160,160,160,0.12)'
                : 'rgba(119,119,119,0.12)',
            },
          ]}
        >
          <Text variant="heading" color="charcoal">
            Bookings
          </Text>
          <Pressable
            onPress={() => router.push('/bookings/past')}
            accessibilityRole="button"
            accessibilityLabel="View past bookings"
            style={styles.pastLink}
          >
            <Text variant="label" style={{ color: palette.electricBlue }}>
              Past
            </Text>
          </Pressable>
        </View>
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
          <CalendarX size={48} color={palette.midGray} strokeWidth={1.5} />
          <Spacer size="md" />
          <Text variant="subheading" color="charcoal">
            No upcoming bookings
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {viewMode === 'provider'
              ? 'No jobs scheduled yet. New bookings from customers will appear here.'
              : 'Ready for a detail? Find a provider and book your first service.'}
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

  // ── Bookings list ──────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomWidth: 1,
            borderBottomColor: isDark
              ? 'rgba(160,160,160,0.12)'
              : 'rgba(119,119,119,0.12)',
          },
        ]}
      >
        <Text variant="heading" color="charcoal">
          Bookings
        </Text>
        <Pressable
          onPress={() => router.push('/bookings/past')}
          accessibilityRole="button"
          accessibilityLabel="View past bookings"
          style={styles.pastLink}
        >
          <Text variant="label" style={{ color: palette.electricBlue }}>
            Past
          </Text>
        </Pressable>
      </View>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  pastLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
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
