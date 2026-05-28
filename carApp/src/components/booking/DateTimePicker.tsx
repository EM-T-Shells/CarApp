// DateTimePicker — date and time selector for scheduling a booking.
// Uses the native RN DateTimePicker under a controlled pattern: the
// parent passes the selected ISO string and receives updates via onChange.
// Renders date and time as separate tappable cards that open the native picker.

import React, { useCallback, useState } from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { formatDate, formatTime, parseISO } from '../../utils/date';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DateTimePickerProps {
  /** Selected date/time as ISO string, or null if not yet chosen. */
  value: string | null;
  /** Called with the new ISO string when the user picks a date or time. */
  onChange: (iso: string) => void;
  /** Earliest allowed date (defaults to now). */
  minimumDate?: Date;
  /** Error message shown below the picker. */
  error?: string;
  /** Optional container style overrides. */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

type PickerMode = 'date' | 'time';

export function DateTimePicker({
  value,
  onChange,
  minimumDate,
  error,
  style,
}: DateTimePickerProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('date');

  const currentDate = value ? parseISO(value) ?? new Date() : new Date();
  const minDate = minimumDate ?? new Date();

  const openPicker = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    setShowPicker(true);
  }, []);

  const handleChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      // On Android the picker dismisses itself on selection.
      if (Platform.OS === 'android') {
        setShowPicker(false);
      }

      if (selectedDate) {
        // Merge the selected component (date or time) into the current value.
        const merged = new Date(currentDate);
        if (pickerMode === 'date') {
          merged.setFullYear(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
          );
        } else {
          merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        }
        onChange(merged.toISOString());
      }
    },
    [currentDate, pickerMode, onChange],
  );

  const handleDone = useCallback(() => {
    setShowPicker(false);
  }, []);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : palette.offWhite;
  const cardBorder = isDark
    ? 'rgba(160,160,160,0.25)'
    : 'rgba(119,119,119,0.2)';

  const dangerRed = isDark ? '#FF6B6B' : '#E74C3C';

  return (
    <View style={style}>
      <Text variant="label" color="charcoal" style={styles.label}>
        Date & Time
      </Text>

      <View style={styles.row}>
        {/* Date card */}
        <Pressable
          onPress={() => openPicker('date')}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: error ? dangerRed : cardBorder,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select date"
        >
          <Calendar size={18} color={palette.electricBlue} strokeWidth={2} />
          <Text
            variant="body"
            color={value ? 'charcoal' : 'midGray'}
            style={styles.cardText}
          >
            {value ? formatDate(value) : 'Choose date'}
          </Text>
        </Pressable>

        {/* Time card */}
        <Pressable
          onPress={() => openPicker('time')}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: error ? dangerRed : cardBorder,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select time"
        >
          <Clock size={18} color={palette.electricBlue} strokeWidth={2} />
          <Text
            variant="body"
            color={value ? 'charcoal' : 'midGray'}
            style={styles.cardText}
          >
            {value ? formatTime(value) : 'Choose time'}
          </Text>
        </Pressable>
      </View>

      {error && (
        <Text
          variant="caption"
          style={[styles.error, { color: dangerRed }]}
        >
          {error}
        </Text>
      )}

      {showPicker && (
        <>
          <RNDateTimePicker
            value={currentDate}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={pickerMode === 'date' ? minDate : undefined}
            onChange={handleChange}
            themeVariant={isDark ? 'dark' : 'light'}
          />
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={handleDone}
              style={styles.doneButton}
              accessibilityRole="button"
              accessibilityLabel="Done selecting"
            >
              <Text variant="label" color="electricBlue">
                Done
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export default DateTimePicker;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  cardText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    marginTop: spacing.xs,
  },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    minHeight: 44,
    justifyContent: 'center',
  },
});
