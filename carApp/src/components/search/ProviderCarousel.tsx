// ProviderCarousel — a titled, horizontally-scrolling row of provider tiles
// for the search home discovery sections ("Top-rated detailers", etc.).
// Renders a section header with an optional "See all" action, then a
// horizontal FlatList of ProviderCarouselCard tiles. Handles loading and
// empty states inline; the parent owns the error state for the whole screen.

import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  type ListRenderItem,
} from 'react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import {
  ProviderCarouselCard,
  CAROUSEL_CARD_WIDTH,
} from './ProviderCarouselCard';
import { colors, spacing } from '../../design/tokens';
import type { ProviderSearchResult } from '../../lib/supabase/queries';

// ── Props ────────────────────────────────────────────────────────────────────

export interface ProviderCarouselProps {
  /** Section heading, e.g. "Top-rated detailers near you". */
  title: string;
  /** Providers to render as cards. */
  providers: ProviderSearchResult[];
  /** True while the providers are loading — shows a spinner in place of cards. */
  loading?: boolean;
  /** Called when a provider card is tapped. */
  onPressProvider: (provider: ProviderSearchResult) => void;
  /** Optional "See all" action shown in the header; hidden when omitted. */
  onSeeAll?: () => void;
  /** Message shown when there are no providers and loading has finished. */
  emptyLabel?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ProviderCarousel({
  title,
  providers,
  loading = false,
  onPressProvider,
  onSeeAll,
  emptyLabel = 'None available yet',
}: ProviderCarouselProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const renderItem = useCallback<ListRenderItem<ProviderSearchResult>>(
    ({ item }) => (
      <ProviderCarouselCard
        provider={item}
        onPress={() => onPressProvider(item)}
      />
    ),
    [onPressProvider],
  );

  const keyExtractor = useCallback(
    (item: ProviderSearchResult) => item.id,
    [],
  );

  return (
    <View>
      <View style={styles.header}>
        <Text variant="subheading" color="charcoal" style={styles.title}>
          {title}
        </Text>
        {onSeeAll && (
          <Text
            variant="label"
            color="electricBlue"
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={`See all — ${title}`}
          >
            See all
          </Text>
        )}
      </View>

      <Spacer size="md" />

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={palette.electricBlue} />
        </View>
      ) : providers.length === 0 ? (
        <View style={styles.stateBox}>
          <Text variant="caption" color="midGray">
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ItemSeparator}
          // Cards are fixed-width — precompute layout for smoother scrolling.
          getItemLayout={getItemLayout}
        />
      )}
    </View>
  );
}

export default ProviderCarousel;

// ── Layout helpers ────────────────────────────────────────────────────────────

const ITEM_STRIDE = CAROUSEL_CARD_WIDTH + spacing.md;

function ItemSeparator(): React.ReactElement {
  return <Spacer size="md" horizontal />;
}

function getItemLayout(
  _data: ArrayLike<ProviderSearchResult> | null | undefined,
  index: number,
): { length: number; offset: number; index: number } {
  return {
    length: CAROUSEL_CARD_WIDTH,
    offset: ITEM_STRIDE * index,
    index,
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
  },
  stateBox: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    // Small vertical padding so the elevated card shadows aren't clipped.
    paddingVertical: spacing.xs,
  },
});
