// LocationSearchBar — location text input for the search tab.
// Renders a MapPin icon, text input, and a clear button when text is
// entered. Updates the Zustand search store's locationQuery on change.

import React, { useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { MapPin, Search, X } from 'lucide-react-native';
import { colors, borderRadius, spacing } from '../../design/tokens';
import { textStyles, fontFamilies } from '../../design/typography';
import { useSearchStore } from '../../state/search';

// ── Props ────────────────────────────────────────────────────────────────────

export interface LocationSearchBarProps {
  /** Called when the user submits (presses return) in the search bar. */
  onSubmit?: () => void;
  /** Placeholder text. Defaults to 'Enter your location'. */
  placeholder?: string;
  /** Render a search button at the end of the field that triggers onSubmit. */
  showSearchButton?: boolean;
  /** Shows a spinner in the embedded search button while a search runs. */
  loading?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export function LocationSearchBar({
  onSubmit,
  placeholder = 'Enter your location',
  showSearchButton = false,
  loading = false,
}: LocationSearchBarProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const locationQuery = useSearchStore((s) => s.locationQuery);
  const setLocationQuery = useSearchStore((s) => s.setLocationQuery);

  const handleClear = useCallback(() => {
    setLocationQuery('');
  }, [setLocationQuery]);

  const borderColor = isDark
    ? 'rgba(160,160,160,0.35)'
    : 'rgba(119,119,119,0.2)';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : palette.offWhite,
          borderColor,
        },
        showSearchButton && styles.containerWithButton,
      ]}
      accessibilityRole="search"
      accessibilityLabel="Location search"
    >
      <MapPin
        size={20}
        color={palette.electricBlue}
        strokeWidth={2}
        style={styles.icon}
      />

      <TextInput
        style={[
          styles.input,
          {
            color: palette.charcoal,
            fontFamily: fontFamilies.ui,
            fontSize: textStyles.body.fontSize,
          },
        ]}
        value={locationQuery}
        onChangeText={setLocationQuery}
        placeholder={placeholder}
        placeholderTextColor={palette.midGray}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        accessibilityLabel="Location input"
      />

      {locationQuery.length > 0 && (
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel="Clear location"
          hitSlop={8}
        >
          <X size={16} color={palette.midGray} strokeWidth={2} />
        </Pressable>
      )}

      {showSearchButton && (
        <Pressable
          onPress={onSubmit}
          disabled={loading}
          hitSlop={4}
          style={[
            styles.searchButton,
            { backgroundColor: palette.deepIndigo },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Search providers"
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.offWhite} />
          ) : (
            <Search size={20} color={palette.offWhite} strokeWidth={2} />
          )}
        </Pressable>
      )}
    </View>
  );
}

export default LocationSearchBar;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  // Tuck the embedded search button against the field's right edge.
  containerWithButton: {
    paddingRight: spacing.xs,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    includeFontPadding: false,
  },
  // WCAG 2.1 AA — 44×44pt minimum touch target.
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Embedded search action — 44×44pt minimum touch target.
  searchButton: {
    width: 40,
    height: 40,
    marginLeft: spacing.xs,
    borderRadius: borderRadius.input,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
