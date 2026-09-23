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
import {
  colors,
  spacing,
  borderRadius,
  type Palette,
} from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getQuoteRequestsForProvider,
  getUpcomingBookingsForProvider,
  getProviderByUserId,
  type BookingSummary,
} from '../../../src/lib/supabase/queries';
import ProviderDayView from '../../../src/components/provider/ProviderDayView';
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
  // Unpriced requests waiting on the provider. Kept separate from bookings
  // because they are not scheduled work: they hold no slot, their scheduled_at
  // is a placeholder until the quote lands, and they must not appear on the
  // day timeline as if they were committed jobs.
  const [requests, setRequests] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Bumped on pull-to-refresh so the day view refetches alongside the list.
  const [refreshToken, setRefreshToken] = useState(0);

  // Cached after the first lookup. Held in state as well as a ref because the
  // day view cannot mount until the provider profile id is known, and a ref
  // does not re-render when it is.
  const providerIdRef = useRef<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);

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
        setProviderId(profile.id);
      }
      const [jobsRes, requestsRes] = await Promise.all([
        getUpcomingBookingsForProvider(providerIdRef.current),
        getQuoteRequestsForProvider(providerIdRef.current),
      ]);

      if (jobsRes.error) setError(jobsRes.error);
      else setBookings(jobsRes.data ?? []);

      // A failed request fetch does not blank the jobs list — the scheduled
      // work is the more important half of this screen.
      if (!requestsRes.error) setRequests(requestsRes.data ?? []);

      setIsLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshToken((n) => n + 1);
    fetchJobs(true).finally(() => setIsRefreshing(false));
  }, [fetchJobs]);

  const handleJobPress = useCallback(
    (bookingId: string) => {
      router.push(`/(provider-tabs)/jobs/${bookingId}`);
    },
    [router],
  );

  const handleQuotePress = useCallback(
    (bookingId: string) => {
      router.push(`/(provider-tabs)/jobs/quote/${bookingId}`);
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

  // Rendered as the list header rather than above the FlatList so it scrolls
  // away with the jobs instead of pinning a third of the screen.
  const dayView = providerId ? (
    <ProviderDayView
      providerId={providerId}
      onPressJob={handleJobPress}
      refreshToken={refreshToken}
    />
  ) : null;

  // Requests sit above the day view: an unpriced request is the only thing on
  // this screen with nobody else acting on it, so it is the thing most at risk
  // of being forgotten. Oldest first, matching the query.
  const requestsSection =
    requests.length > 0 ? (
      <View style={styles.requestsSection}>
        <Text variant="subheading" color="charcoal">
          Requests ({requests.length})
        </Text>
        <Text variant="caption" color="midGray">
          Waiting for your price.
        </Text>
        {requests.map((request) => {
          const awaitingProvider = request.status === 'pending_provider_quote';
          const vehicle = request.vehicles;
          return (
            <Pressable
              key={request.id}
              onPress={() =>
                awaitingProvider
                  ? handleQuotePress(request.id)
                  : handleJobPress(request.id)
              }
              accessibilityRole="button"
              accessibilityLabel={
                awaitingProvider
                  ? `Send a quote for ${vehicle?.make ?? 'this request'}`
                  : `View request for ${vehicle?.make ?? 'this booking'}`
              }
              testID={`quote-request-${request.id}`}
              style={({ pressed }) => [
                styles.requestCard,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.06)'
                    : palette.offWhite,
                  borderColor: awaitingProvider
                    ? palette.electricBlue
                    : isDark
                      ? 'rgba(160,160,160,0.25)'
                      : 'rgba(119,119,119,0.2)',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text variant="label" color="charcoal">
                {vehicle
                  ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                  : 'Vehicle'}
              </Text>
              <Text variant="caption" color="midGray">
                {awaitingProvider
                  ? 'Needs a quote'
                  : 'Waiting on the customer to approve'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

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
          contentContainerStyle={styles.emptyContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={palette.electricBlue}
            />
          }
        >
          {/* An empty queue is exactly when the day view is most worth seeing:
              it is the difference between "nothing booked" and "nothing booked
              because you are on time off all week". */}
          {requestsSection}
          {dayView}
          <View style={styles.emptyMessage}>
            <Briefcase size={48} color={palette.midGray} strokeWidth={1.5} />
            <Spacer size="md" />
            <Text variant="subheading" color="charcoal">
              No jobs scheduled
            </Text>
            <Spacer size="sm" />
            <Text variant="body" color="midGray" style={styles.centeredText}>
              New bookings from customers will appear here.
            </Text>
          </View>
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
        ListHeaderComponent={
          <>
            {requestsSection}
            {dayView}
          </>
        }
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
  requestsSection: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  requestCard: {
    borderWidth: 1.5,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
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
  emptyContent: {
    flexGrow: 1,
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
  emptyMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
});
