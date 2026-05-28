// Provider profile — detailed view of a single provider. Shows avatar,
// bio, gear rating, job/kudos stats, coverage area, service packages
// with prices and duration, and a sticky "Book Now" CTA at the bottom.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Star, MapPin, Briefcase, Award, Clock } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../../src/components/ui/Text';
import { Button } from '../../../../src/components/ui/Button';
import { Card } from '../../../../src/components/ui/Card';
import { Avatar } from '../../../../src/components/ui/Avatar';
import { Rating } from '../../../../src/components/ui/Rating';
import { Spacer } from '../../../../src/components/ui/Spacer';
import { colors, spacing } from '../../../../src/design/tokens';
import { getProviderById } from '../../../../src/lib/supabase/queries';
import type { ProviderDetail } from '../../../../src/lib/supabase/queries';
import type { ProviderDetailParams } from '../../../../src/types/navigation';
import { centsToDisplay } from '../../../../src/utils/money';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

// ── Screen ───────────────────────────────────────────────────────────

export default function ProviderDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<ProviderDetailParams>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      const result = await getProviderById(id);
      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        setProvider(result.data);
      }
      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBook = useCallback(() => {
    router.push(`/search/book/${id}`);
  }, [id, router]);

  const name = provider?.users?.full_name ?? 'Provider';

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error || !provider) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <Text variant="subheading" color="charcoal">
            Could not load provider
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray">
            {error?.message ?? 'Provider not found'}
          </Text>
          <Spacer size="lg" />
          <Button
            label="Go Back"
            variant="primary"
            size="md"
            onPress={() => router.back()}
          />
        </View>
      </>
    );
  }

  const rating = Number(provider.avg_gear_rating ?? 0);
  const totalJobs = provider.total_jobs ?? 0;
  const kudosCount = provider.kudos_count ?? 0;
  const typeLabel = provider.provider_types?.label;
  const avatarUri = provider.users?.avatar_url;

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Profile header ─────────────────────────────────── */}
          <View style={styles.profileHeader}>
            <Avatar name={name} uri={avatarUri} size="xl" />
            <Spacer size="md" />
            <Text variant="heading" color="charcoal">
              {name}
            </Text>
            {typeLabel && (
              <>
                <Spacer size="xs" />
                <Text variant="label" color="electricBlue">
                  {typeLabel}
                </Text>
              </>
            )}
          </View>

          <Spacer size="lg" />

          {/* ── Stats row ─────────────────────────────────────── */}
          <View style={styles.statsRow}>
            {rating > 0 && (
              <View style={styles.statItem}>
                <Star
                  size={18}
                  color={palette.gearGold}
                  fill={palette.gearGold}
                  strokeWidth={1}
                />
                <Text variant="label" style={{ color: palette.gearGold }}>
                  {rating.toFixed(1)}
                </Text>
              </View>
            )}
            {totalJobs > 0 && (
              <View style={styles.statItem}>
                <Briefcase
                  size={16}
                  color={palette.midGray}
                  strokeWidth={2}
                />
                <Text variant="label" color="midGray">
                  {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
                </Text>
              </View>
            )}
            {kudosCount > 0 && (
              <View style={styles.statItem}>
                <Award size={16} color={palette.midGray} strokeWidth={2} />
                <Text variant="label" color="midGray">
                  {kudosCount} kudos
                </Text>
              </View>
            )}
          </View>

          {/* ── Coverage area ─────────────────────────────────── */}
          {provider.coverage_area && (
            <>
              <Spacer size="md" />
              <View style={styles.locationRow}>
                <MapPin size={16} color={palette.midGray} strokeWidth={2} />
                <Text variant="body" color="midGray" style={styles.flexText}>
                  {provider.coverage_area}
                  {provider.mile_radius
                    ? ` (${Number(provider.mile_radius)} mi radius)`
                    : ''}
                </Text>
              </View>
            </>
          )}

          {/* ── Bio ───────────────────────────────────────────── */}
          {provider.bio && (
            <>
              <Spacer size="xl" />
              <Text variant="label" color="charcoal">
                About
              </Text>
              <Spacer size="sm" />
              <Text variant="body" color="midGray">
                {provider.bio}
              </Text>
            </>
          )}

          {/* ── Gear rating ───────────────────────────────────── */}
          {rating > 0 && (
            <>
              <Spacer size="xl" />
              <Text variant="label" color="charcoal">
                Rating
              </Text>
              <Spacer size="sm" />
              <Card variant="outlined">
                <View style={styles.ratingRow}>
                  <Rating
                    value={rating}
                    size="md"
                    accessibilityLabel={`Overall rating: ${rating.toFixed(1)} out of 5`}
                  />
                  <Text variant="price" style={{ color: palette.gearGold }}>
                    {rating.toFixed(1)}
                  </Text>
                </View>
              </Card>
            </>
          )}

          {/* ── Service packages ──────────────────────────────── */}
          {provider.service_packages.length > 0 && (
            <>
              <Spacer size="xl" />
              <Text variant="label" color="charcoal">
                Services Offered
              </Text>
              <Spacer size="sm" />
              {provider.service_packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  variant="outlined"
                  style={styles.serviceCard}
                >
                  <View style={styles.serviceRow}>
                    <View style={styles.serviceInfo}>
                      <Text variant="body" color="charcoal">
                        {pkg.name}
                      </Text>
                      {pkg.description != null &&
                        pkg.description.length > 0 && (
                          <Text
                            variant="caption"
                            color="midGray"
                            numberOfLines={2}
                          >
                            {pkg.description}
                          </Text>
                        )}
                      {pkg.duration_mins != null && (
                        <View style={styles.durationRow}>
                          <Clock
                            size={12}
                            color={palette.midGray}
                            strokeWidth={2}
                          />
                          <Text variant="caption" color="midGray">
                            {formatDuration(pkg.duration_mins)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {pkg.base_price != null && (
                      <Text variant="price" color="charcoal">
                        {centsToDisplay(
                          Math.round(Number(pkg.base_price) * 100),
                        )}
                      </Text>
                    )}
                  </View>
                </Card>
              ))}
            </>
          )}

          {/* Bottom padding so content doesn't hide behind the sticky CTA */}
          <Spacer size={100} />
        </ScrollView>

        {/* ── Sticky Book Now button ──────────────────────────── */}
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
            <Button
              label="Book Now"
              variant="primary"
              size="lg"
              onPress={handleBook}
            />
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}

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
  scrollContent: {
    padding: spacing.base,
  },
  profileHeader: {
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flexText: {
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceCard: {
    marginBottom: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  serviceInfo: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
});
