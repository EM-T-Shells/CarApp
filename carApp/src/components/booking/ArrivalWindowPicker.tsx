// ArrivalWindowPicker — day + arrival window selector for a quote-first request.
//
// Replaces DateTimePicker on the booking screen. The difference is the point of
// the quote flow: the customer states a *window* they can be available in, and
// the provider picks the exact start inside it when they quote (submit_quote
// validates that the start falls within the window). Asking the customer for an
// exact minute would be asking them to schedule a job whose duration nobody has
// estimated yet.
//
// Controlled, like DateTimePicker: the parent holds the value and receives
// updates through onChange. The window is emitted as two ISO strings, which is
// what bookings.requested_window_start / requested_window_end take.
//
// Windows come from presets rather than two free-form time pickers. The DB
// enforces requested_window_end > requested_window_start
// (bookings_requested_window_check), and a preset cannot violate it — two loose
// pickers can, and would surface as a 23514 at insert.

import React, { useCallback, useMemo, useState } from 'react';
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
import { Calendar } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { formatDate, parseISO } from '../../utils/date';
import type { ArrivalWindow } from '../../types/models';

export type { ArrivalWindow };

// ─── Window presets ──────────────────────────────────────────────────────────

/**
 * Local wall-clock hours. Resolved against the chosen calendar day in the
 * device's own zone, so a window means the same thing to the customer wherever
 * they are — and lands on the correct instant across a DST boundary, because
 * the Date is built from local components rather than by adding hours to UTC.
 */
export interface ArrivalWindowPreset {
  id: string;
  label: string;
  /** Inclusive start hour, 0–23, device-local. */
  startHour: number;
  /** Exclusive end hour, 0–23, device-local. Always greater than startHour. */
  endHour: number;
}

export const ARRIVAL_WINDOW_PRESETS: readonly ArrivalWindowPreset[] = [
  { id: 'morning', label: 'Morning', startHour: 8, endHour: 12 },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 16 },
  { id: 'evening', label: 'Evening', startHour: 16, endHour: 20 },
];

/**
 * Builds a window from a calendar day and a preset, in the device's local zone.
 * Exported for the booking screen's tests, which assert the payload rather than
 * driving the picker.
 */
export function buildArrivalWindow(
  day: Date,
  preset: ArrivalWindowPreset,
): ArrivalWindow {
  const start = new Date(day);
  start.setHours(preset.startHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(preset.endHour, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Which preset a stored window corresponds to, or null when it matches none.
 * Lets the picker rehydrate its selection from a value it did not just emit —
 * a draft restored from state, or a request being edited.
 */
export function presetForWindow(window: ArrivalWindow | null): string | null {
  if (!window) return null;
  const start = parseISO(window.start);
  const end = parseISO(window.end);
  if (!start || !end) return null;
  const match = ARRIVAL_WINDOW_PRESETS.find(
    (p) => p.startHour === start.getHours() && p.endHour === end.getHours(),
  );
  return match?.id ?? null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ArrivalWindowPickerProps {
  /** The selected window, or null if the customer has not chosen one yet. */
  value: ArrivalWindow | null;
  /** Called whenever the day or the preset changes and both are known. */
  onChange: (window: ArrivalWindow) => void;
  /** Earliest selectable day (defaults to today). */
  minimumDate?: Date;
  /** Error message shown below the picker. */
  error?: string;
  /** Optional container style overrides. */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ArrivalWindowPicker({
  value,
  onChange,
  minimumDate,
  error,
  style,
}: ArrivalWindowPickerProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [showPicker, setShowPicker] = useState(false);

  // The day is held separately from the window because the customer picks it
  // first: there is a moment where a day is chosen and no preset is, and the
  // parent must not receive a half-formed window during it.
  const [day, setDay] = useState<Date>(() => {
    const parsed = value ? parseISO(value.start) : null;
    return parsed ?? minimumDate ?? new Date();
  });

  const selectedPreset = useMemo(() => presetForWindow(value), [value]);
  const minDate = minimumDate ?? new Date();

  const handleDayChange = useCallback(
    (_event: DateTimePickerEvent, picked?: Date) => {
      // On Android the picker dismisses itself on selection.
      if (Platform.OS === 'android') {
        setShowPicker(false);
      }
      if (!picked) return;

      const next = new Date(day);
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setDay(next);

      // Moving the day keeps the chosen window, so changing your mind about
      // Tuesday does not silently clear "afternoon".
      const preset = ARRIVAL_WINDOW_PRESETS.find((p) => p.id === selectedPreset);
      if (preset) {
        onChange(buildArrivalWindow(next, preset));
      }
    },
    [day, selectedPreset, onChange],
  );

  const handlePreset = useCallback(
    (preset: ArrivalWindowPreset) => {
      onChange(buildArrivalWindow(day, preset));
    },
    [day, onChange],
  );

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : palette.offWhite;
  const cardBorder = isDark
    ? 'rgba(160,160,160,0.25)'
    : 'rgba(119,119,119,0.2)';
  const dangerRed = isDark ? '#FF6B6B' : '#E74C3C';

  return (
    <View style={style}>
      <Text variant="label" color="charcoal" style={styles.label}>
        Day & arrival window
      </Text>

      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: error && !value ? dangerRed : cardBorder,
          },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Select day"
        testID="arrival-window-day"
      >
        <Calendar size={18} color={palette.electricBlue} strokeWidth={2} />
        <Text variant="body" color="charcoal" style={styles.cardText}>
          {formatDate(day.toISOString())}
        </Text>
      </Pressable>

      <View style={styles.presetRow}>
        {ARRIVAL_WINDOW_PRESETS.map((preset) => {
          const active = preset.id === selectedPreset;
          return (
            <Pressable
              key={preset.id}
              onPress={() => handlePreset(preset)}
              style={({ pressed }) => [
                styles.preset,
                {
                  backgroundColor: active ? palette.electricBlue : cardBg,
                  borderColor: active
                    ? palette.electricBlue
                    : error && !value
                      ? dangerRed
                      : cardBorder,
                },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${preset.label} window, ${formatHourLabel(
                preset.startHour,
              )} to ${formatHourLabel(preset.endHour)}`}
              testID={`arrival-window-${preset.id}`}
            >
              <Text
                variant="label"
                color={active ? 'offWhite' : 'charcoal'}
                style={styles.presetLabel}
              >
                {preset.label}
              </Text>
              <Text
                variant="caption"
                color={active ? 'offWhite' : 'midGray'}
                style={styles.presetLabel}
              >
                {formatHourLabel(preset.startHour)}–
                {formatHourLabel(preset.endHour)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" color="midGray" style={styles.hint}>
        Your provider picks an exact start time inside this window when they
        send your price.
      </Text>

      {error && (
        <Text variant="caption" style={[styles.error, { color: dangerRed }]}>
          {error}
        </Text>
      )}

      {showPicker && (
        <>
          <RNDateTimePicker
            value={day}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minDate}
            onChange={handleDayChange}
            themeVariant={isDark ? 'dark' : 'light'}
          />
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={() => setShowPicker(false)}
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

/** 14 → "2 PM". Presets are whole hours, so no minutes to render. */
function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized} ${suffix}`;
}

export default ArrivalWindowPicker;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  card: {
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
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 56,
  },
  presetLabel: {
    textAlign: 'center',
  },
  hint: {
    marginTop: spacing.sm,
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
