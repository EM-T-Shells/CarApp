// AvailabilityCalendar (Flows 4.7 / 5.2) — a controlled weekly availability
// picker. Day-level for MVP (which days you accept jobs); a future iteration
// can add per-day time windows.
//
// Persistence: provider_profiles.availability is a JSONB column (added in
// Flow 5.2). The value maps 1:1 to WeeklyAvailability, so callers write it
// straight through updateProviderProfile({ availability }); read it back with
// availabilityFromJson() to coerce a stored Json value into a full
// WeeklyAvailability (filling any missing days from DEFAULT_AVAILABILITY).

import React from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius } from '../../design/tokens';
import {
  workingHoursFromJson,
  workingHoursToAvailability,
  type DayKey,
} from '../../utils/schedule';

// DayKey lives in utils/schedule now — working hours and this picker have to
// agree on the week, and two identical unions drift.
export type { DayKey };

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

/**
 * Coerce a stored availability value into a full WeeklyAvailability. Missing or
 * malformed days fall back to DEFAULT_AVAILABILITY so the picker always renders
 * a complete week.
 *
 * Reads **both shapes**, because after migration 20260819000000 a provider's
 * real schedule lives in `provider_profiles.working_hours` as per-day windows
 * while `availability` stays for older clients. Handed the window shape, a day
 * with at least one window is available. That keeps this day-level picker
 * honest against a provider who has already set times — without it, opening
 * this screen would read their 9–5 Monday as "unset" and offer to overwrite it.
 */
export function availabilityFromJson(value: unknown): WeeklyAvailability {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_AVAILABILITY };
  }
  const record = value as Record<string, unknown>;

  // The window shape is unambiguous — an array value never appears in the
  // boolean map — so detect it and go through the schedule parser, which
  // already drops corrupt windows.
  const hasWindows = DAYS.some(({ key }) => Array.isArray(record[key]));
  if (hasWindows) {
    return workingHoursToAvailability(workingHoursFromJson(value));
  }

  const result: WeeklyAvailability = { ...DEFAULT_AVAILABILITY };
  for (const { key } of DAYS) {
    if (typeof record[key] === 'boolean') {
      result[key] = record[key] as boolean;
    }
  }
  return result;
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
