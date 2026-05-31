// AvailabilityCalendar (Flows 4.7 / 5.2) — a controlled weekly availability
// picker. Day-level for MVP (which days you accept jobs); a future iteration
// can add per-day time windows.
//
// NOTE: provider_profiles has no availability column yet, so callers currently
// hold this in local state only. Persisting it needs a schema column (e.g.
// `availability JSONB`) + a `supabase gen types` regen before it can be written
// through updateProviderProfile.

import React from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius } from '../../design/tokens';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type WeeklyAvailability = Record<DayKey, boolean>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

/** Sensible default: available weekdays, off on the weekend. */
export const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

export interface AvailabilityCalendarProps {
  value: WeeklyAvailability;
  onChange: (value: WeeklyAvailability) => void;
}

export function AvailabilityCalendar({
  value,
  onChange,
}: AvailabilityCalendarProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {DAYS.map((day) => {
        const on = value[day.key];
        return (
          <Pressable
            key={day.key}
            onPress={() => onChange({ ...value, [day.key]: !on })}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${day.label} availability`}
            testID={`availability-${day.key}`}
            style={[
              styles.day,
              {
                borderColor: on ? palette.electricBlue : palette.midGray,
                backgroundColor: on ? palette.electricBlue : 'transparent',
              },
            ]}
          >
            <Text
              variant="caption"
              style={{ color: on ? '#FFFFFF' : palette.midGray, fontWeight: '600' }}
            >
              {day.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default AvailabilityCalendar;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  day: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.input,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
