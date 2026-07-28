// Provider job queue — the Jobs tab root in the provider dashboard. Lists the
// provider's active jobs (pending approval → confirmed → en_route → in_progress)
// and routes into the active-job detail screen. Handles loading, empty, and
// error states per convention.
//
// Extracted from the provider branch of the customer bookings list when the
// provider dashboard got its own tab bar — this is provider-only, so there is
// no customer/provider view toggle here anymore.

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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Briefcase, ChevronRight, Clock, Car } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing, type Palette } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getUpcomingBookingsForProvider,
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
  pending: { label: 'Pending', colorKey: 'midGray' },
  pending_provider_approval: { label: 'Action Needed', colorKey: 'gearGold' },
  confirmed: { label: 'Confirmed', colorKey: 'electricBlue' },
  en_route: { label: 'En Route', colorKey: 'gearGold' },
  in_progress: { label: 'In Progress', colorKey: 'emeraldGreen' },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] ?? STATUS_MAP['pending'];
}

// ── JobCard ────────────────────────────────────────────────────────────

interface JobCardProps {
  booking: BookingSummary;
  onPress: () => void;
  palette: Palette;
}

function JobCard({ booking, onPress, palette }: JobCardProps): React.ReactElement {
  const vehicle = booking.vehicles;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  const { label: statusLabel, colorKey } = getStatusConfig(booking.status);
  const statusColor = palette[colorKey];

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Job on ${formatShortDate(booking.scheduled_at)}`}
      accessibilityHint="Tap to manage this job"
    >
      {/* Status + schedule row */}
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

      {/* Time */}
      <View style={cardStyles.row}>
        <Clock size={13} color={palette.midGray} strokeWidth={2} />
        <Spacer size="xs" horizontal />
        <Text variant="bodySmall" color="midGray">
          {formatShortDate(booking.scheduled_at)} · {formatTime(booking.scheduled_at)}
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

// ── Screen ─────────────────────────────────────────────────────────────

export default function ProviderJobsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);

  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cache the provider profile ID after the first lookup.
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
      const { data, error: err } = await getUpcomingBookingsForProvider(
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
      <JobCard
        booking={item}
        palette={palette}
        onPress={() => handleJobPress(item.id)}
      />
    ),
    [palette, handleJobPress],
  );

  const keyExtractor = useCallback((item: BookingSummary) => item.id, []);

  const header = (
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
        Jobs
      </Text>
      <Pressable
        onPress={() => router.push('/(provider-tabs)/jobs/past')}
        accessibilityRole="button"
        accessibilityLabel="View past jobs"
        style={styles.pastLink}
      >
        <Text variant="label" style={{ color: palette.electricBlue }}>
          Past
        </Text>
      </Pressable>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
          <Spacer size="md" />
          <Text variant="body" color="midGray">
            Loading jobs...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
        <View style={styles.centered}>
          <Text variant="subheading" color="charcoal">
            Something went wrong
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────
  if (bookings.length === 0) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
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
          <Briefcase size={48} color={palette.midGray} strokeWidth={1.5} />
          <Spacer size="md" />
          <Text variant="subheading" color="charcoal">
            No jobs scheduled
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            New bookings from customers will appear here.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      {header}
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
    </SafeAreaView>
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
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
