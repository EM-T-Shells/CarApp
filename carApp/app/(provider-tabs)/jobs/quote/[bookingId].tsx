// Provider quote screen — price an unpriced request.
//
// Reached from the Requests section of the Jobs tab. Loads the request, shows
// what the customer asked for, and hands QuoteBuilder the draft. Sending calls
// submitQuote(), which is the Edge Function action — a price is outside the
// client's write surface on bookings by design (§4), so nothing here writes
// the row directly.
//
// The quote total shown is a preview. The server recomputes it from the row's
// derived total_amount and returns the authoritative figure, which is what the
// customer approves.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../../src/components/ui/Text';
import { Button } from '../../../../src/components/ui/Button';
import { Card } from '../../../../src/components/ui/Card';
import { Spacer } from '../../../../src/components/ui/Spacer';
import QuoteBuilder, {
  type QuoteDraft,
  startOptions,
} from '../../../../src/components/provider/QuoteBuilder';
import { colors, spacing } from '../../../../src/design/tokens';
import { getProviderJobById } from '../../../../src/lib/supabase/queries';
import { submitQuote } from '../../../../src/lib/stripe';
import type { ProviderJobSummary } from '../../../../src/lib/supabase/queries';
import type { ProviderQuoteParams } from '../../../../src/types/navigation';
import type { ArrivalWindow } from '../../../../src/types/models';
import { formatDate } from '../../../../src/utils/date';
import {
  conditionAnswersFromJson,
  PET_LEVEL_LABELS,
  SOIL_LEVEL_LABELS,
  STAIN_LEVEL_LABELS,
} from '../../../../src/utils/suggestion';

export default function QuoteRequestScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<ProviderQuoteParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [booking, setBooking] = useState<ProviderJobSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [draft, setDraft] = useState<QuoteDraft | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);

      const result = await getProviderJobById(bookingId);
      if (cancelled) return;

      if (result.error) {
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }

      setBooking(result.data);

      // Pre-fill from what the server already worked out. suggested_duration_mins
      // is derived by trg_derive_booking_suggestion from the package, the
      // declared size and the condition answers — the provider overrides it
      // with the stepper rather than starting from nothing.
      const window = toWindow(result.data);
      const firstStart = window ? (startOptions(window)[0] ?? null) : null;
      setDraft({
        scheduledAt: firstStart,
        durationMins:
          result.data.suggested_duration_mins ??
          result.data.estimated_duration_mins ??
          60,
        // Surcharges start empty. delta_price on service_duration_modifiers is
        // stored but applied to nothing today; pre-filling from it is the next
        // step, and must stay a client-side pre-fill that the server revalidates
        // — wiring a provider-writable table into derive_booking_amounts would
        // hand the client an indirect route to the totals it was denied.
        lineItems: [],
      });
      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const window = useMemo(() => (booking ? toWindow(booking) : null), [booking]);

  const handleSend = useCallback(async () => {
    if (!booking || !draft || !draft.scheduledAt) return;

    setIsSubmitting(true);
    setSubmitError(undefined);

    const result = await submitQuote({
      bookingId: booking.id,
      scheduledAt: draft.scheduledAt,
      estimatedDurationMins: draft.durationMins,
      // Empty labels would fail the grammar trigger, so drop blank rows rather
      // than sending them — a provider who added a line and changed their mind
      // should not get a 400.
      lineItems: draft.lineItems
        .filter((item) => item.label.trim().length > 0 && item.amountCents > 0)
        .map((item) => ({
          label: item.label.trim(),
          amount_cents: item.amountCents,
        })),
    });

    setIsSubmitting(false);

    if (result.error) {
      // submitQuote reads the real message off the Edge Function's response
      // body; the distinctions matter here (start outside the window, duration
      // out of range, request already cancelled) so show it rather than a
      // generic failure.
      setSubmitError(result.error.message);
      return;
    }

    Alert.alert(
      'Quote sent',
      'The customer has been notified and will review your price.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  }, [booking, draft, router]);

  if (isLoading || !draft) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator color={palette.electricBlue} />
      </SafeAreaView>
    );
  }

  if (loadError || !booking) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="body" color="charcoal">
          {loadError?.message ?? 'Request not found'}
        </Text>
      </SafeAreaView>
    );
  }

  if (!window) {
    // A quote-first request always carries both ends; a row without them is a
    // legacy deposit-first booking that reached this screen by mistake.
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="body" color="charcoal" style={styles.centeredText}>
          This booking has no arrival window, so it cannot be quoted.
        </Text>
      </SafeAreaView>
    );
  }

  const vehicle = booking.vehicles;
  // The three questions, in the order the customer answered them. Read through
  // conditionAnswersFromJson so an unrecognised value from an older row is
  // dropped rather than rendered raw.
  const answers = conditionAnswersFromJson(booking.condition_answers);
  const conditionLines: { prompt: string; value: string }[] = [
    answers.soil_level && {
      prompt: 'Interior',
      value: SOIL_LEVEL_LABELS[answers.soil_level],
    },
    answers.pets && {
      prompt: 'Kids or pets',
      value: PET_LEVEL_LABELS[answers.pets],
    },
    answers.stains && {
      prompt: 'Stains, smoke or pet hair',
      value: STAIN_LEVEL_LABELS[answers.stains],
    },
  ].filter(Boolean) as { prompt: string; value: string }[];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── What was asked for ─────────────────────────────────── */}
        <Card>
          <Text variant="subheading" color="charcoal">
            {booking.customer?.full_name ?? 'Customer'}
          </Text>
          <Spacer size="sm" />
          {vehicle && (
            <Text variant="body" color="midGray">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {booking.vehicle_size_class ? ` · ${booking.vehicle_size_class}` : ''}
            </Text>
          )}
          <Text variant="body" color="midGray">
            {formatDate(window.start)}
          </Text>
          {booking.service_address && (
            <Text variant="body" color="midGray">
              {booking.service_address}
            </Text>
          )}
          {booking.notes && (
            <>
              <Spacer size="sm" />
              <Text variant="body" color="charcoal">
                “{booking.notes}”
              </Text>
            </>
          )}
        </Card>

        {conditionLines.length > 0 && (
          <>
            <Spacer size="md" />
            <Card>
              <Text variant="label" color="charcoal">
                Condition
              </Text>
              <Spacer size="sm" />
              {conditionLines.map((line) => (
                <View key={line.prompt} style={styles.answerLine}>
                  <Text variant="caption" color="midGray">
                    {line.prompt}
                  </Text>
                  <Text variant="body" color="charcoal">
                    {line.value}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}

        <Spacer size="lg" />

        <QuoteBuilder
          window={window}
          baseTotalCents={Math.round(Number(booking.total_amount ?? 0) * 100)}
          draft={draft}
          onChange={setDraft}
          error={submitError}
        />

        <Spacer size="xl" />

        <Button
          label="Send Quote"
          variant="primary"
          size="lg"
          onPress={handleSend}
          loading={isSubmitting}
          disabled={!draft.scheduledAt}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Both ends or nothing — the CHECK constraint guarantees they travel together. */
function toWindow(booking: ProviderJobSummary): ArrivalWindow | null {
  if (!booking.requested_window_start || !booking.requested_window_end) {
    return null;
  }
  return {
    start: booking.requested_window_start,
    end: booking.requested_window_end,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
  },
  centeredText: {
    textAlign: 'center',
  },
  answerLine: {
    marginBottom: spacing.sm,
  },
});
