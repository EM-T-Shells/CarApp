// TimeOffEditor (Phase 1) — the provider's one-off calendar blocks.
//
// Working hours say what a normal week looks like; this says which specific
// days are gone. A holiday, a sick day, an afternoon at the dentist. The two
// are separate because a vacation is not a change to the weekly pattern, and
// editing the pattern to take a week off would leave the provider to remember
// to put it back.
//
// Advisory, like working hours: nothing here refuses a booking. The database
// stores the block and DayTimeline draws it, so the provider sees the clash and
// decides. See migration 20260819000000 for why.
//
// The blocks themselves are absolute instants, unlike working hours — a
// provider blocking out "next Tuesday" means a specific Tuesday, so there is no
// wall-clock/DST problem to solve here. The DAY the picker offers is still
// local, which is why the caller passes a timezone in.

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarOff, Plus, Trash2 } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import type { ProviderTimeOff } from '../../types/models';
import { startOfLocalDay } from '../../utils/schedule';

// ── Formatting ────────────────────────────────────────────────────────

/**
 * "Tue, Sep 15" or "Tue, Sep 15 – Fri, Sep 18" for a multi-day block.
 *
 * The end instant is exclusive — a block ending at midnight on the 19th covers
 * through the 18th — so the label subtracts a minute before formatting. Without
 * that, a provider blocking one day reads it back as two.
 */
export function formatBlockRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Invalid dates';
  }

  const lastCovered = new Date(end.getTime() - 60_000);
  const startLabel = formatDayLabel(start, timeZone);
  const endLabel = formatDayLabel(lastCovered, timeZone);

  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function formatDayLabel(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(
      date,
    );
  } catch {
    // An unresolvable zone must degrade to the device's, not to a blank row.
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

/**
 * The instants a whole-day block covers: local midnight on the first day
 * through local midnight after the last.
 *
 * Half-open on purpose, to match blocked_range's '[)' bound — otherwise two
 * adjacent blocks would trip provider_time_off_no_overlap at the shared
 * midnight.
 */
export function wholeDayRange(
  firstDay: Date,
  lastDay: Date,
  timeZone: string,
): { startsAt: string; endsAt: string } {
  const start = startOfLocalDay(firstDay, timeZone);
  const endDayStart = startOfLocalDay(lastDay, timeZone);
  // Land midday inside the following day so a 23- or 25-hour day still resolves
  // to the next one, then snap to its midnight.
  const end = startOfLocalDay(
    new Date(endDayStart.getTime() + 36 * 60 * 60_000),
    timeZone,
  );
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// ── Props ─────────────────────────────────────────────────────────────

export interface TimeOffEditorProps {
  blocks: ProviderTimeOff[];
  timeZone: string;
  isBusy?: boolean;
  onAdd: (block: {
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }) => void;
  onRemove: (id: string) => void;
}

type PickerTarget = 'first' | 'last' | null;

// ── Component ─────────────────────────────────────────────────────────

export function TimeOffEditor({
  blocks,
  timeZone,
  isBusy = false,
  onAdd,
  onRemove,
}: TimeOffEditorProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const styles = useMemo(() => makeStyles(palette, isDark), [palette, isDark]);

  const [isAdding, setIsAdding] = useState(false);
  const [firstDay, setFirstDay] = useState<Date>(() => new Date());
  const [lastDay, setLastDay] = useState<Date>(() => new Date());
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState<PickerTarget>(null);

  const handlePicked = useCallback(
    (_event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === 'android') setPicking(null);
      if (!picked || !picking) return;

      if (picking === 'first') {
        setFirstDay(picked);
        // Dragging the start past the end is a slip, not an intent to create an
        // inverted range the database will reject. Carry the end along.
        setLastDay((current) => (picked > current ? picked : current));
      } else {
        setLastDay(picked);
      }
    },
    [picking],
  );

  const handleSubmit = useCallback(() => {
    const { startsAt, endsAt } = wholeDayRange(firstDay, lastDay, timeZone);
    onAdd({ startsAt, endsAt, reason: reason.trim() || null });
    setIsAdding(false);
    setReason('');
  }, [firstDay, lastDay, reason, timeZone, onAdd]);

  return (
    <View style={styles.container}>
      {blocks.length === 0 && !isAdding ? (
        <View style={styles.empty}>
          <CalendarOff size={20} color={palette.midGray} strokeWidth={1.5} />
          <Spacer size="xs" />
          <Text variant="caption" color="midGray" style={styles.centeredText}>
            No time off scheduled.
          </Text>
        </View>
      ) : null}

      {blocks.map((block) => (
        <View key={block.id} style={styles.blockRow} testID={`time-off-${block.id}`}>
          <View style={styles.blockText}>
            <Text variant="bodySmall" color="charcoal">
              {formatBlockRange(block.starts_at, block.ends_at, timeZone)}
            </Text>
            {block.reason ? (
              <Text variant="caption" color="midGray">
                {block.reason}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => onRemove(block.id)}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`Remove time off on ${formatBlockRange(
              block.starts_at,
              block.ends_at,
              timeZone,
            )}`}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Trash2 size={16} color={palette.midGray} strokeWidth={2} />
          </Pressable>
        </View>
      ))}

      {isAdding ? (
        <View style={styles.form}>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => setPicking('first')}
              accessibilityRole="button"
              accessibilityLabel="First day off"
              style={styles.dateField}
            >
              <Text variant="caption" color="midGray">
                From
              </Text>
              <Text variant="bodySmall" color="charcoal">
                {formatDayLabel(firstDay, timeZone)}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setPicking('last')}
              accessibilityRole="button"
              accessibilityLabel="Last day off"
              style={styles.dateField}
            >
              <Text variant="caption" color="midGray">
                Through
              </Text>
              <Text variant="bodySmall" color="charcoal">
                {formatDayLabel(lastDay, timeZone)}
              </Text>
            </Pressable>
          </View>

          <Spacer size="sm" />
          <TextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Vacation"
            maxLength={80}
          />
          <Spacer size="sm" />

          <View style={styles.formActions}>
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => setIsAdding(false)}
            />
            <Button
              label="Add"
              variant="primary"
              size="sm"
              loading={isBusy}
              onPress={handleSubmit}
              testID="time-off-submit"
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setIsAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add time off"
          style={styles.addRow}
        >
          <Plus size={16} color={palette.electricBlue} strokeWidth={2} />
          <Text variant="label" style={{ color: palette.electricBlue }}>
            Add time off
          </Text>
        </Pressable>
      )}

      {isBusy && !isAdding ? (
        <ActivityIndicator color={palette.electricBlue} />
      ) : null}

      {picking ? (
        <RNDateTimePicker
          value={picking === 'first' ? firstDay : lastDay}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePicked}
          // The start cannot precede the end; the end cannot precede the start.
          minimumDate={picking === 'last' ? firstDay : undefined}
        />
      ) : null}

      {picking && Platform.OS === 'ios' ? (
        <Button
          label="Done"
          variant="secondary"
          size="sm"
          onPress={() => setPicking(null)}
        />
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(palette: Palette, isDark: boolean) {
  const hairline = isDark ? 'rgba(160,160,160,0.16)' : 'rgba(119,119,119,0.16)';
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: hairline,
      borderRadius: borderRadius.card,
      padding: spacing.sm,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    centeredText: { textAlign: 'center' },
    blockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    blockText: { flex: 1 },
    iconButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
      paddingHorizontal: spacing.xs,
    },
    form: {
      paddingTop: spacing.sm,
    },
    dateRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dateField: {
      flex: 1,
      borderWidth: 1,
      borderColor: hairline,
      borderRadius: borderRadius.input,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
  });
}

export default TimeOffEditor;
