// WorkingHoursEditor (Phase 1) — the per-day windows behind
// provider_profiles.working_hours, replacing the day-level on/off picker.
//
// Why windows and not a single pair: a detailer who breaks for lunch, or works
// mornings and evenings, cannot express that with one range, and flattening it
// would put them on the calendar at a time they never agreed to. Each day holds
// an ordered list; an empty list means closed.
//
// Times are wall-clock strings ("08:00"), never instants. The native picker
// deals in Date objects, so this converts at the edges only — a Date is used as
// a carrier for hours and minutes and its calendar day is meaningless. Storing
// an instant instead would bake in a UTC offset and shift every window twice a
// year at the DST boundary.
//
// Controlled: the parent owns the value and receives a whole WorkingHours back.

import React, { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Plus, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import {
  DAY_KEYS,
  DAY_SHORT_LABELS,
  DEFAULT_WINDOW,
  cloneWorkingHours,
  formatClockLabel,
  formatHHMM,
  parseHHMM,
  type DayKey,
  type TimeWindow,
  type WorkingHours,
} from '../../utils/schedule';

// ── Props ─────────────────────────────────────────────────────────────

export interface WorkingHoursEditorProps {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
}

/** Which field the native picker is currently editing. */
interface EditTarget {
  day: DayKey;
  index: number;
  field: 'start' | 'end';
}

// ── Pure edit operations ──────────────────────────────────────────────
// Exported so the rules can be tested without driving a native picker.

/** Turn a day on with the default window, or off entirely. */
export function setDayOpen(
  hours: WorkingHours,
  day: DayKey,
  open: boolean,
): WorkingHours {
  const next = cloneWorkingHours(hours);
  next[day] = open ? [{ ...DEFAULT_WINDOW }] : [];
  return next;
}

/**
 * Append a window after the last one on the day.
 *
 * Starts an hour after the current last close, so the new row never lands
 * inside the existing one — a second window that opens before the first closes
 * is a merge, not a split, and the provider has to notice they meant that.
 */
export function addWindow(hours: WorkingHours, day: DayKey): WorkingHours {
  const next = cloneWorkingHours(hours);
  const windows = next[day];
  if (windows.length === 0) {
    next[day] = [{ ...DEFAULT_WINDOW }];
    return next;
  }
  const lastEnd = parseHHMM(windows[windows.length - 1].end) ?? 12 * 60;
  const start = Math.min(lastEnd + 60, 23 * 60);
  const end = Math.min(start + 120, 24 * 60 - 1);
  if (end <= start) return next;
  windows.push({ start: formatHHMM(start), end: formatHHMM(end) });
  return next;
}

export function removeWindow(
  hours: WorkingHours,
  day: DayKey,
  index: number,
): WorkingHours {
  const next = cloneWorkingHours(hours);
  next[day] = next[day].filter((_, i) => i !== index);
  return next;
}

/**
 * Move one edge of one window.
 *
 * Dragging an edge past its partner is treated as intent, not error: the other
 * edge is pushed to keep at least 15 minutes of window. Rejecting the input
 * instead would leave the picker showing a time the value does not have.
 */
export function setWindowEdge(
  hours: WorkingHours,
  day: DayKey,
  index: number,
  field: 'start' | 'end',
  minutes: number,
): WorkingHours {
  const next = cloneWorkingHours(hours);
  const window = next[day][index];
  if (!window) return next;

  const MIN_SPAN = 15;
  const clamped = Math.max(0, Math.min(24 * 60 - MIN_SPAN, minutes));

  if (field === 'start') {
    const end = parseHHMM(window.end) ?? clamped + MIN_SPAN;
    window.start = formatHHMM(clamped);
    if (end <= clamped) window.end = formatHHMM(clamped + MIN_SPAN);
  } else {
    const start = parseHHMM(window.start) ?? 0;
    const end = Math.max(clamped, MIN_SPAN);
    window.end = formatHHMM(end);
    if (end <= start) window.start = formatHHMM(Math.max(0, end - MIN_SPAN));
  }

  return next;
}

/** A Date carrying only hours and minutes, for the native picker. */
function toPickerDate(value: string): Date {
  const minutes = parseHHMM(value) ?? 0;
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

// ── Component ─────────────────────────────────────────────────────────

export function WorkingHoursEditor({
  value,
  onChange,
}: WorkingHoursEditorProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const styles = makeStyles(palette, isDark);

  const [editing, setEditing] = useState<EditTarget | null>(null);

  const handlePicked = useCallback(
    (_event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === 'android') setEditing(null);
      if (!picked || !editing) return;
      onChange(
        setWindowEdge(
          value,
          editing.day,
          editing.index,
          editing.field,
          picked.getHours() * 60 + picked.getMinutes(),
        ),
      );
    },
    [editing, onChange, value],
  );

  const editingWindow: TimeWindow | undefined = editing
    ? value[editing.day]?.[editing.index]
    : undefined;

  return (
    <View style={styles.container}>
      {DAY_KEYS.map((day) => {
        const windows = value[day] ?? [];
        const open = windows.length > 0;

        return (
          <View key={day} style={styles.dayRow}>
            <View style={styles.dayHeader}>
              <Pressable
                onPress={() => onChange(setDayOpen(value, day, !open))}
                accessibilityRole="switch"
                accessibilityState={{ checked: open }}
                accessibilityLabel={`${DAY_SHORT_LABELS[day]}, ${
                  open ? 'working' : 'closed'
                }`}
                style={[
                  styles.dayToggle,
                  open && { backgroundColor: palette.electricBlue },
                ]}
              >
                <Text
                  variant="label"
                  color={open ? 'offWhite' : 'midGray'}
                >
                  {DAY_SHORT_LABELS[day]}
                </Text>
              </Pressable>

              {open ? (
                <Pressable
                  onPress={() => onChange(addWindow(value, day))}
                  accessibilityRole="button"
                  accessibilityLabel={`Add another window on ${DAY_SHORT_LABELS[day]}`}
                  style={styles.iconButton}
                >
                  <Plus size={16} color={palette.midGray} strokeWidth={2} />
                </Pressable>
              ) : (
                <Text variant="bodySmall" color="midGray">
                  Closed
                </Text>
              )}
            </View>

            {windows.map((window, index) => (
              <View key={`${day}-${index}`} style={styles.windowRow}>
                <Pressable
                  onPress={() => setEditing({ day, index, field: 'start' })}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAY_SHORT_LABELS[day]} window ${
                    index + 1
                  } start, ${formatClockLabel(window.start)}`}
                  style={styles.timeField}
                >
                  <Text variant="bodySmall">{formatClockLabel(window.start)}</Text>
                </Pressable>

                <Text variant="bodySmall" color="midGray">
                  to
                </Text>

                <Pressable
                  onPress={() => setEditing({ day, index, field: 'end' })}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAY_SHORT_LABELS[day]} window ${
                    index + 1
                  } end, ${formatClockLabel(window.end)}`}
                  style={styles.timeField}
                >
                  <Text variant="bodySmall">{formatClockLabel(window.end)}</Text>
                </Pressable>

                {windows.length > 1 && (
                  <Pressable
                    onPress={() => onChange(removeWindow(value, day, index))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${DAY_SHORT_LABELS[day]} window ${
                      index + 1
                    }`}
                    style={styles.iconButton}
                  >
                    <X size={16} color={palette.midGray} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        );
      })}

      {editing && editingWindow && (
        <RNDateTimePicker
          value={toPickerDate(editingWindow[editing.field])}
          mode="time"
          minuteInterval={15}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePicked}
        />
      )}

      {editing && Platform.OS === 'ios' && (
        <Pressable
          onPress={() => setEditing(null)}
          accessibilityRole="button"
          accessibilityLabel="Done choosing a time"
          style={styles.doneButton}
        >
          <Text variant="label" color="electricBlue">
            Done
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default WorkingHoursEditor;

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    dayRow: {
      gap: spacing.xs,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    dayToggle: {
      minWidth: 56,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.midGray,
      alignItems: 'center',
      justifyContent: 'center',
    },
    windowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginLeft: 56 + spacing.sm,
    },
    timeField: {
      minHeight: 44,
      minWidth: 88,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.midGray,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(240,240,240,0.04)' : 'rgba(34,34,34,0.03)',
    },
    iconButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneButton: {
      alignSelf: 'flex-end',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
  });
}
