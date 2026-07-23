// ProviderCarouselCard — compact, fixed-width provider tile for the
// horizontal discovery carousels on the search home screen. A slimmer
// counterpart to ProviderCard (used in the vertical results list): avatar,
// name, provider type, and a rating + job-count row. Tapping opens the
// provider detail screen.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Star, Briefcase } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import type { ProviderSearchResult } from '../../lib/supabase/queries';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fixed card width so cards align consistently while scrolling. */
export const CAROUSEL_CARD_WIDTH = 200;

// ── Props ────────────────────────────────────────────────────────────────────

export interface ProviderCarouselCardProps {
  /** Provider search result to display. */
  provider: ProviderSearchResult;
  /** Called when the card is tapped. Typically navigates to provider/[id]. */
  onPress: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const ProviderCarouselCard = React.memo<ProviderCarouselCardProps>(
  function ProviderCarouselCard({ provider, onPress }) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;

    const name = provider.users?.full_name ?? 'Provider';
    const avatarUri = provider.users?.avatar_url;
    const typeLabel = provider.provider_types?.label;
    const rating = Number(provider.avg_gear_rating ?? 0);
    const totalJobs = provider.total_jobs ?? 0;

    return (
      <Card
        variant="elevated"
        onPress={onPress}
        style={styles.card}
        accessibilityLabel={`${name}, ${typeLabel ?? 'Provider'}`}
        accessibilityHint="Opens provider profile"
      >
        <View style={styles.inner}>
          <Avatar name={name} uri={avatarUri} size="xl" />
          <Spacer size="sm" />
          <Text
            variant="subheading"
            color="charcoal"
            numberOfLines={1}
            style={styles.centeredText}
          >
            {name}
          </Text>

          {typeLabel && (
            <Text
              variant="caption"
              color="electricBlue"
              numberOfLines={1}
              style={styles.centeredText}
            >
              {typeLabel}
            </Text>
          )}

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
                <Briefcase size={13} color={palette.midGray} strokeWidth={2} />
                <Text variant="caption" color="midGray">
                  {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    );
  },
);

ProviderCarouselCard.displayName = 'ProviderCarouselCard';

export default ProviderCarouselCard;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    width: CAROUSEL_CARD_WIDTH,
  },
  inner: {
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
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
});
