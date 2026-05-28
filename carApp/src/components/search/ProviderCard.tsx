// ProviderCard — card tile displaying a provider search result.
// Shows avatar, name, provider type, gear rating, job count, kudos
// count, coverage area, and a truncated bio. Tapping navigates to
// the provider detail screen.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Star, MapPin, Briefcase, Award } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import type { ProviderSearchResult } from '../../lib/supabase/queries';

// ── Props ────────────────────────────────────────────────────────────────────

export interface ProviderCardProps {
  /** Provider search result to display. */
  provider: ProviderSearchResult;
  /** Called when the card is tapped. Typically navigates to provider/[id]. */
  onPress: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const ProviderCard = React.memo<ProviderCardProps>(
  function ProviderCard({ provider, onPress }) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;

    const name = provider.users?.full_name ?? 'Provider';
    const avatarUri = provider.users?.avatar_url;
    const typeLabel = provider.provider_types?.label;
    const rating = Number(provider.avg_gear_rating ?? 0);
    const totalJobs = provider.total_jobs ?? 0;
    const kudosCount = provider.kudos_count ?? 0;

    return (
      <Card
        variant="elevated"
        onPress={onPress}
        accessibilityLabel={`${name}, ${typeLabel ?? 'Provider'}`}
        accessibilityHint="Opens provider profile"
      >
        {/* ── Header row: avatar + info ─────────────────── */}
        <View style={styles.topRow}>
          <Avatar name={name} uri={avatarUri} size="lg" />
          <Spacer size="md" horizontal />
          <View style={styles.info}>
            <Text variant="subheading" color="charcoal" numberOfLines={1}>
              {name}
            </Text>

            {typeLabel && (
              <Text variant="caption" color="electricBlue">
                {typeLabel}
              </Text>
            )}

            {/* Rating + stats */}
            <Spacer size="xs" />
            <View style={styles.statsRow}>
              {rating > 0 && (
                <View style={styles.stat}>
                  <Star
                    size={14}
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
                <View style={styles.stat}>
                  <Briefcase
                    size={13}
                    color={palette.midGray}
                    strokeWidth={2}
                  />
                  <Text variant="caption" color="midGray">
                    {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
                  </Text>
                </View>
              )}

              {kudosCount > 0 && (
                <View style={styles.stat}>
                  <Award
                    size={13}
                    color={palette.midGray}
                    strokeWidth={2}
                  />
                  <Text variant="caption" color="midGray">
                    {kudosCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Bio ──────────────────────────────────────────── */}
        {provider.bio ? (
          <>
            <Spacer size="sm" />
            <Text variant="body" color="midGray" numberOfLines={2}>
              {provider.bio}
            </Text>
          </>
        ) : null}

        {/* ── Coverage area ────────────────────────────────── */}
        {provider.coverage_area ? (
          <>
            <Spacer size="xs" />
            <View style={styles.locationRow}>
              <MapPin size={13} color={palette.midGray} strokeWidth={2} />
              <Text
                variant="caption"
                color="midGray"
                numberOfLines={1}
                style={styles.locationText}
              >
                {provider.coverage_area}
              </Text>
            </View>
          </>
        ) : null}
      </Card>
    );
  },
);

ProviderCard.displayName = 'ProviderCard';

export default ProviderCard;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    flex: 1,
  },
});
