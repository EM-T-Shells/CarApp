// TimezoneField (Phase 1) — picks provider_profiles.timezone.
//
// The column is NOT NULL and everything about working hours depends on it:
// hours are wall-clock strings, so "08:00" is a different instant in Denver
// than in Reston, and a wrong zone is wrong by whole hours rather than being
// approximately right.
//
// A full IANA list is ~600 entries and nearly all of them are noise for a
// US-market detailing app, so this offers the continental US zones plus the
// device's own when it is something else — which covers a provider who moved
// without needing a searchable list of Antarctic research stations. The
// database is the real gate either way: trg_validate_provider_schedule checks
// the value against pg_timezone_names, so an unknown zone is refused at write
// time rather than accepted and silently misapplied.

import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';

/** The zones a US detailer plausibly works in, in west-to-east order. */
export const COMMON_TIMEZONES: readonly { value: string; label: string }[] = [
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'Eastern' },
];

/**
 * The offered list: the common zones, plus `current` when it is not among them.
 *
 * Appending rather than replacing matters — a provider whose stored zone is
 * unusual must still see it selected, or the field would silently present a
 * different zone as their setting and save it on the next tap.
 */
export function timezoneOptions(
  current: string,
): { value: string; label: string }[] {
  const options = [...COMMON_TIMEZONES];
  if (current && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: shortZoneLabel(current) });
  }
  return options;
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function shortZoneLabel(zone: string): string {
  const tail = zone.split('/').pop() ?? zone;
  return tail.replace(/_/g, ' ');
}

export interface TimezoneFieldProps {
  value: string;
  onChange: (zone: string) => void;
}

export function TimezoneField({
  value,
  onChange,
}: TimezoneFieldProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const styles = useMemo(() => makeStyles(palette, isDark), [palette, isDark]);

  const options = useMemo(() => timezoneOptions(value), [value]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} time`}
            style={[
              styles.chip,
              selected && { backgroundColor: palette.electricBlue },
            ]}
          >
            <Text variant="bodySmall" color={selected ? 'offWhite' : 'midGray'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.button,
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(160,160,160,0.24)'
        : 'rgba(119,119,119,0.24)',
      minHeight: 44,
      justifyContent: 'center',
    },
  });
}

export default TimezoneField;
