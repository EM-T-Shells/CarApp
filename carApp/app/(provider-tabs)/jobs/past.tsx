// Provider past jobs — history view for the provider's completed and cancelled
// jobs. Pushed from the Jobs tab "Past" link. Provider-only, so there's no
// customer/provider toggle and no customer-facing "Book Again" CTA.
//
// Extracted from the provider branch of the customer past-bookings list when
// the provider dashboard got its own tab bar.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Archive, Car, Clock, Briefcase } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing, type Palette } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getPastBookingsForProvider,
  getProviderByUserId,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import { centsToDisplay } from '../../../src/utils/money';
import { formatShortDate, formatTime } from '../../../src/utils/date';

// ── Status config ──────────────────────────────────────────────────────

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

// ── PastJobCard ─────────────────────────────────────────────────────────

interface PastJobCardProps {
  booking: BookingSummary;
  palette: Palette;
  onPress: () => void;
}

function PastJobCard({
  booking,
  palette,
  onPress,
}: PastJobCardProps): React.ReactElement {
  const vehicle = booking.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  const { label: statusLabel, colorKey } = getStatusConfig(booking.status);
  const statusColor = palette[colorKey];

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${statusLabel} job on ${formatShortDate(booking.scheduled_at)}`}
      accessibilityHint="Tap to view job details"
    >
      <View style={cardStyles.row}>
        <View style={cardStyles.jobIcon}>
          <Briefcase size={16} color={palette.deepIndigo} strokeWidth={2} />
        </View>
        <Spacer size="sm" horizontal />
        <Text
          variant="label"
          color="charcoal"
          numberOfLines={1}
          style={cardStyles.flex}
        >
          {formatShortDate(booking.scheduled_at)}
        </Text>
        <View
          style={[cardStyles.statusPill, { backgroundColor: statusColor + '22' }]}
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
          {formatShortDate(booking.scheduled_at)} · {formatTime(booking.scheduled_at)}
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
  jobIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(61,59,142,0.08)',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginLeft: spacing.sm,
  },
});

// ── Screen ──────────────────────────────────────────────────────────────

export default function ProviderPastJobsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);

  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const providerIdRef = useRef<string | null>(null);

  const fetchJobs = useCallback(
    async (refresh = false) => {
      if (!user) return;
      if (!refresh) setIsLoading(true);
      setError(null);

      if (!providerIdRef.current) {
        const { data: profile, error: profileError } = await getProviderByUserId(
          user.id,
        );
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

      setIsLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchJobs(true).finally(() => setIsRefreshing(false));
  }, [fetchJobs]);

  const handleJobPress = useCallback(
    (bookingId: string) => {
      router.push(`/(provider-tabs)/jobs/${bookingId}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: BookingSummary }) => (
      <PastJobCard
        booking={item}
        palette={palette}
        onPress={() => handleJobPress(item.id)}
      />
    ),
    [palette, handleJobPress],
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
            onPress={() => fetchJobs()}
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
            No past jobs
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            You haven&apos;t completed any jobs yet. Past work will show here.
          </Text>
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
    paddingTop: spacing.md,
  },
});
