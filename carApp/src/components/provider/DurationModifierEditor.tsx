// DurationModifierEditor (Phase 2) — the provider's calibration knobs.
//
// service_duration_modifiers is per-provider rather than platform-wide because
// a two-person crew and a solo detailer genuinely disagree about what an SUV
// costs them, and a shared constant would be wrong for both. This is where a
// provider states their own numbers.
//
// Only the duration side is editable here. delta_price exists on the table and
// is deliberately applied to nothing in Phase 2 — bookings are priced by
// derive_booking_amounts from service_packages alone, and surfacing a price
// field that changes no price would be a lie. It becomes the itemised surcharge
// the customer approves in Phase 3.
//
// Deltas are relative to the package's own duration_mins, so 0 means "no
// different from the base" and is the same as having no row at all. That is why
// clearing a field deletes rather than storing a zero: a zero row is noise in
// the provider's own list.

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import {
  FACTOR_TYPES,
  FACTOR_TYPE_LABELS,
  FACTOR_VALUES,
  factorValueLabel,
  type FactorType,
} from '../../utils/suggestion';
import type { ServiceDurationModifier } from '../../types/models';

// ── Bounds ────────────────────────────────────────────────────────────
// service_duration_modifiers_delta_mins_check. Enforced here too so a typo is
// a hint rather than a 23514 the provider has to decode.
export const MIN_DELTA_MINS = -240;
export const MAX_DELTA_MINS = 480;

/**
 * Reads a typed delta, or null when the field is empty or unusable.
 *
 * Null and 0 mean different things to the caller: null is "no opinion, remove
 * the row", 0 is "explicitly the same as base" — which is also no row, but
 * arrived at deliberately. Both delete; the distinction matters for whether the
 * field is left showing something.
 */
export function parseDelta(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return Math.min(Math.max(rounded, MIN_DELTA_MINS), MAX_DELTA_MINS);
}

/** Index the flat modifier list by "factorType:factorValue" for lookup. */
export function indexModifiers(
  modifiers: ServiceDurationModifier[],
): Record<string, ServiceDurationModifier> {
  const index: Record<string, ServiceDurationModifier> = {};
  for (const modifier of modifiers) {
    index[`${modifier.factor_type}:${modifier.factor_value}`] = modifier;
  }
  return index;
}

// ── Props ─────────────────────────────────────────────────────────────

export interface DurationModifierEditorProps {
  modifiers: ServiceDurationModifier[];
  /** Called with null to clear a factor, or a signed minute delta to set it. */
  onChange: (
    factorType: FactorType,
    factorValue: string,
    deltaMins: number | null,
  ) => void;
  isBusy?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────

export function DurationModifierEditor({
  modifiers,
  onChange,
  isBusy = false,
}: DurationModifierEditorProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const styles = useMemo(() => makeStyles(palette, isDark), [palette, isDark]);

  const index = useMemo(() => indexModifiers(modifiers), [modifiers]);

  // Drafts are held locally so a partially typed "-" or "1" does not round-trip
  // to the database on every keystroke. Committed on blur.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const valueFor = useCallback(
    (key: string): string => {
      if (drafts[key] !== undefined) return drafts[key];
      const existing = index[key];
      return existing ? String(existing.delta_mins) : '';
    },
    [drafts, index],
  );

  const commit = useCallback(
    (factorType: FactorType, factorValue: string, key: string) => {
      const raw = drafts[key];
      // Untouched field: nothing to commit.
      if (raw === undefined) return;

      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      const parsed = parseDelta(raw);
      const existing = index[key];

      // A zero delta is the same as no row — it says "no different from the
      // base" — so it clears rather than storing a row that changes nothing.
      if (parsed === null || parsed === 0) {
        if (existing) onChange(factorType, factorValue, null);
        return;
      }
      if (existing && existing.delta_mins === parsed) return;
      onChange(factorType, factorValue, parsed);
    },
    [drafts, index, onChange],
  );

  return (
    <View style={styles.container}>
      {FACTOR_TYPES.map((factorType, groupIndex) => (
        <View key={factorType}>
          {groupIndex > 0 ? <Spacer size="md" /> : null}
          <Text variant="label" color="charcoal">
            {FACTOR_TYPE_LABELS[factorType]}
          </Text>
          <Spacer size="xs" />
          <Text variant="caption" color="midGray">
            Minutes to add or subtract from the package time. Leave blank for no
            change.
          </Text>
          <Spacer size="sm" />

          {FACTOR_VALUES[factorType].map((factorValue) => {
            const key = `${factorType}:${factorValue}`;
            return (
              <View key={key} style={styles.row}>
                <View style={styles.rowLabel}>
                  <Text variant="bodySmall" color="charcoal">
                    {factorValueLabel(factorType, factorValue)}
                  </Text>
                </View>
                <View style={styles.rowField}>
                  <TextField
                    testID={`modifier-${key}`}
                    value={valueFor(key)}
                    onChangeText={(text) =>
                      setDrafts((current) => ({ ...current, [key]: text }))
                    }
                    onBlur={() => commit(factorType, factorValue, key)}
                    placeholder="0"
                    // Signed: a compact really is quicker than the base, and the
                    // table allows a negative delta for exactly that.
                    keyboardType="numbers-and-punctuation"
                    disabled={isBusy}
                    maxLength={4}
                    accessibilityLabel={`${FACTOR_TYPE_LABELS[factorType]}, ${factorValueLabel(
                      factorType,
                      factorValue,
                    )}, minutes`}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(160,160,160,0.16)'
        : 'rgba(119,119,119,0.16)',
      borderRadius: borderRadius.card,
      padding: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    rowLabel: { flex: 1 },
    rowField: { width: 96 },
  });
}

export default DurationModifierEditor;
