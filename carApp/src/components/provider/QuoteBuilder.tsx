// QuoteBuilder — the provider prices an unpriced request.
//
// Controlled and presentational: the parent owns the draft quote and this
// renders it. Submitting belongs to the screen, which calls submitQuote().
//
// Three things the provider states, and one they do not:
//   • the exact start, chosen INSIDE the customer's arrival window
//   • how long the job will take
//   • optional itemised surcharges ("SUV +$30, heavy pet hair +$25")
//   • NOT the total — the server adds the surcharges to the row's derived
//     total_amount and returns the result. The figure shown here is a preview
//     computed the same way, never the authority.
//
// The bounds come from supabase/functions/_shared/quote.ts rather than being
// restated, so the control cannot offer a value prepareQuote will reject. That
// module carries no remote imports, which is why it is inside tsconfig's reach
// and safe to import from the app.

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Minus, Plus, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';
import { formatTime } from '../../utils/date';
import { formatDuration } from '../../utils/duration';
import type { ArrivalWindow } from '../../types/models';
import {
  MAX_QUOTE_DURATION_MINS,
  MAX_QUOTE_LINE_ITEMS,
  MAX_LINE_ITEM_LABEL_LENGTH,
  MIN_QUOTE_DURATION_MINS,
} from '../../../supabase/functions/_shared/quote';

/** Minutes between the start options offered inside the window. */
const START_STEP_MINS = 30;

/** How much one tap of the duration stepper moves. */
export const DURATION_STEP_MINS = 15;

/** A surcharge line as the provider is editing it. */
export interface QuoteLineItemDraft {
  /** Stable across edits so a list re-render does not reorder inputs. */
  key: string;
  label: string;
  amountCents: number;
}

export interface QuoteDraft {
  /** ISO instant, always one of the offered starts. */
  scheduledAt: string | null;
  durationMins: number;
  lineItems: QuoteLineItemDraft[];
}

export interface QuoteBuilderProps {
  /** The window the customer said they are free in. Starts are drawn from it. */
  window: ArrivalWindow;
  /**
   * The row's derived total_amount in cents — the advertised price the
   * surcharges add to. Server-derived; shown, never edited.
   */
  baseTotalCents: number;
  draft: QuoteDraft;
  onChange: (draft: QuoteDraft) => void;
  /** Inline error, e.g. a rejection returned by submit_quote. */
  error?: string;
  style?: ViewStyle;
}

/**
 * Every start the provider may choose: START_STEP_MINS apart, from the window's
 * start up to its end. Offering only these means a chosen start is always
 * inside the window, so validateQuoteStart cannot refuse it.
 */
export function startOptions(window: ArrivalWindow): string[] {
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const step = START_STEP_MINS * 60_000;
  const out: string[] = [];
  for (let t = start; t <= end; t += step) {
    out.push(new Date(t).toISOString());
  }
  return out;
}

/** Sum of the surcharges. Not the quoted total — the base is added server-side. */
export function surchargeTotalCents(items: QuoteLineItemDraft[]): number {
  return items.reduce((sum, item) => sum + (item.amountCents || 0), 0);
}

export function QuoteBuilder({
  window,
  baseTotalCents,
  draft,
  onChange,
  error,
  style,
}: QuoteBuilderProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const starts = useMemo(() => startOptions(window), [window]);
  const surcharges = surchargeTotalCents(draft.lineItems);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : palette.offWhite;
  const cardBorder = isDark
    ? 'rgba(160,160,160,0.25)'
    : 'rgba(119,119,119,0.2)';
  const dangerRed = isDark ? '#FF6B6B' : '#E74C3C';

  const setDuration = useCallback(
    (next: number) => {
      // Clamped rather than validated-and-rejected: the stepper simply stops at
      // the bounds prepareQuote enforces.
      const clamped = Math.min(
        MAX_QUOTE_DURATION_MINS,
        Math.max(MIN_QUOTE_DURATION_MINS, next),
      );
      onChange({ ...draft, durationMins: clamped });
    },
    [draft, onChange],
  );

  const addLineItem = useCallback(() => {
    if (draft.lineItems.length >= MAX_QUOTE_LINE_ITEMS) return;
    onChange({
      ...draft,
      lineItems: [
        ...draft.lineItems,
        { key: `item-${Date.now()}`, label: '', amountCents: 0 },
      ],
    });
  }, [draft, onChange]);

  const updateLineItem = useCallback(
    (key: string, patch: Partial<QuoteLineItemDraft>) => {
      onChange({
        ...draft,
        lineItems: draft.lineItems.map((item) =>
          item.key === key ? { ...item, ...patch } : item,
        ),
      });
    },
    [draft, onChange],
  );

  const removeLineItem = useCallback(
    (key: string) => {
      onChange({
        ...draft,
        lineItems: draft.lineItems.filter((item) => item.key !== key),
      });
    },
    [draft, onChange],
  );

  const atMinDuration = draft.durationMins <= MIN_QUOTE_DURATION_MINS;
  const atMaxDuration = draft.durationMins >= MAX_QUOTE_DURATION_MINS;

  return (
    <View style={style}>
      {/* ── Start time ─────────────────────────────────────────────── */}
      <Text variant="label" color="charcoal">
        Start time
      </Text>
      <Text variant="caption" color="midGray">
        The customer is free {formatTime(window.start)}–
        {formatTime(window.end)}.
      </Text>
      <Spacer size="sm" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.startRow}
      >
        {starts.map((iso) => {
          const active = iso === draft.scheduledAt;
          return (
            <Pressable
              key={iso}
              onPress={() => onChange({ ...draft, scheduledAt: iso })}
              style={({ pressed }) => [
                styles.startChip,
                {
                  backgroundColor: active ? palette.electricBlue : cardBg,
                  borderColor: active ? palette.electricBlue : cardBorder,
                },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Start at ${formatTime(iso)}`}
              testID={`quote-start-${iso}`}
            >
              <Text variant="label" color={active ? 'offWhite' : 'charcoal'}>
                {formatTime(iso)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Spacer size="lg" />

      {/* ── Duration ───────────────────────────────────────────────── */}
      <Text variant="label" color="charcoal">
        How long will it take?
      </Text>
      <Spacer size="sm" />

      <View style={[styles.stepper, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Pressable
          onPress={() => setDuration(draft.durationMins - DURATION_STEP_MINS)}
          disabled={atMinDuration}
          style={({ pressed }) => [
            styles.stepperButton,
            atMinDuration && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Decrease duration"
          accessibilityState={{ disabled: atMinDuration }}
          testID="quote-duration-minus"
        >
          <Minus size={20} color={palette.charcoal} strokeWidth={2} />
        </Pressable>

        <Text variant="subheading" color="charcoal" testID="quote-duration-value">
          {formatDuration(draft.durationMins)}
        </Text>

        <Pressable
          onPress={() => setDuration(draft.durationMins + DURATION_STEP_MINS)}
          disabled={atMaxDuration}
          style={({ pressed }) => [
            styles.stepperButton,
            atMaxDuration && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Increase duration"
          accessibilityState={{ disabled: atMaxDuration }}
          testID="quote-duration-plus"
        >
          <Plus size={20} color={palette.charcoal} strokeWidth={2} />
        </Pressable>
      </View>

      <Spacer size="lg" />

      {/* ── Surcharges ─────────────────────────────────────────────── */}
      <Text variant="label" color="charcoal">
        Surcharges (optional)
      </Text>
      <Text variant="caption" color="midGray">
        Itemise anything above your listed price. The customer sees each line.
      </Text>
      <Spacer size="sm" />

      {draft.lineItems.map((item) => (
        <View key={item.key} style={styles.lineItem}>
          <View style={styles.lineItemLabel}>
            <TextField
              label=""
              value={item.label}
              onChangeText={(label) =>
                updateLineItem(item.key, {
                  label: label.slice(0, MAX_LINE_ITEM_LABEL_LENGTH),
                })
              }
              placeholder="Heavy pet hair"
              testID={`quote-item-label-${item.key}`}
            />
          </View>
          <View style={styles.lineItemAmount}>
            <TextField
              label=""
              value={item.amountCents ? String(item.amountCents / 100) : ''}
              onChangeText={(text) =>
                updateLineItem(item.key, { amountCents: dollarsToCents(text) })
              }
              placeholder="0"
              keyboardType="decimal-pad"
              testID={`quote-item-amount-${item.key}`}
            />
          </View>
          <Pressable
            onPress={() => removeLineItem(item.key)}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.label || 'surcharge'}`}
            testID={`quote-item-remove-${item.key}`}
          >
            <X size={18} color={dangerRed} strokeWidth={2} />
          </Pressable>
        </View>
      ))}

      {draft.lineItems.length < MAX_QUOTE_LINE_ITEMS && (
        <Pressable
          onPress={addLineItem}
          style={({ pressed }) => [
            styles.addButton,
            { borderColor: cardBorder },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add a surcharge"
          testID="quote-add-item"
        >
          <Plus size={16} color={palette.electricBlue} strokeWidth={2} />
          <Text variant="label" color="electricBlue">
            Add surcharge
          </Text>
        </Pressable>
      )}

      <Spacer size="lg" />

      {/* ── Preview ────────────────────────────────────────────────── */}
      <Card>
        <View style={styles.totalLine}>
          <Text variant="body" color="midGray">
            Your listed price
          </Text>
          <Text variant="body" color="charcoal">
            {centsToDisplay(baseTotalCents)}
          </Text>
        </View>
        {surcharges > 0 && (
          <View style={styles.totalLine}>
            <Text variant="body" color="midGray">
              Surcharges
            </Text>
            <Text variant="body" color="charcoal">
              {centsToDisplay(surcharges)}
            </Text>
          </View>
        )}
        <Spacer size="sm" />
        <View style={styles.totalLine}>
          <Text variant="label" color="charcoal">
            Quote total
          </Text>
          <Text variant="label" color="charcoal" testID="quote-total">
            {centsToDisplay(baseTotalCents + surcharges)}
          </Text>
        </View>
        <Spacer size="sm" />
        <Text variant="caption" color="midGray">
          The server recalculates this from your listed prices when you send it.
          If it differs, the server&apos;s figure is the one the customer sees.
        </Text>
      </Card>

      {error && (
        <>
          <Spacer size="sm" />
          <Text variant="caption" style={{ color: dangerRed }}>
            {error}
          </Text>
        </>
      )}
    </View>
  );
}

/**
 * "12.50" → 1250. Anything unparseable is 0 rather than NaN, which would
 * propagate into the total and render as "$NaN".
 */
export function dollarsToCents(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export default QuoteBuilder;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  startRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  startChip: {
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingHorizontal: spacing.sm,
    minHeight: 56,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lineItemLabel: {
    flex: 2,
  },
  lineItemAmount: {
    flex: 1,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.input,
    minHeight: 44,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.35,
  },
});
