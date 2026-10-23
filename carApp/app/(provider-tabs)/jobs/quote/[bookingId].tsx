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
//
// Also here, since this is where the provider looks at the request (spec §3:
// "request card leads with the photos"):
//   • the customer's intake photos
//   • surcharges pre-filled from the provider's own modifiers (delta_price)
//   • "Ask for more" — request_more_photos parks the request with a note
//   • "Decline request" — provider_cancel_booking; nothing was charged

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Image,
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
import { Sheet } from '../../../../src/components/ui/Sheet';
import { TextField } from '../../../../src/components/ui/TextField';
import QuoteBuilder, {
  type QuoteDraft,
  startOptions,
} from '../../../../src/components/provider/QuoteBuilder';
import { colors, spacing, borderRadius } from '../../../../src/design/tokens';
import {
  getBookingPhotos,
  getProviderJobById,
  getServiceDurationModifiers,
} from '../../../../src/lib/supabase/queries';
import {
  providerCancelBooking,
  requestMorePhotos,
  submitQuote,
} from '../../../../src/lib/stripe';
import type { ProviderJobSummary } from '../../../../src/lib/supabase/queries';
import type { ProviderQuoteParams } from '../../../../src/types/navigation';
import type { ArrivalWindow, BookingPhoto } from '../../../../src/types/models';
import {
  MAX_INFO_REQUEST_NOTE_LENGTH,
  QUOTABLE_STATUSES,
} from '../../../../supabase/functions/_shared/quote';
import { formatDate } from '../../../../src/utils/date';
import {
  conditionAnswersFromJson,
  PET_LEVEL_LABELS,
  SOIL_LEVEL_LABELS,
  STAIN_LEVEL_LABELS,
  surchargeLineItems,
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
  const [photos, setPhotos] = useState<BookingPhoto[]>([]);
  const [showAskSheet, setShowAskSheet] = useState(false);
  const [askNote, setAskNote] = useState('');

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

      // Photos and modifiers are both optional to quoting: a request with no
      // photos can still be priced, and a provider with no modifiers simply
      // starts with no surcharges. Failures leave them empty rather than
      // blocking the screen.
      const [photosRes, modifiersRes] = await Promise.all([
        getBookingPhotos(result.data.id),
        result.data.provider_id
          ? getServiceDurationModifiers(result.data.provider_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      if (!photosRes.error) setPhotos(photosRes.data ?? []);

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
        // Surcharges pre-filled from the provider's own modifiers for this
        // car's size and condition — the price half of the same modifiers that
        // produced the suggested duration. Editable: the provider changes or
        // deletes any line, and submit_quote validates and totals whatever is
        // sent. It stays a client-side pre-fill on purpose — wiring a
        // provider-writable table into derive_booking_amounts would hand the
        // client an indirect route to the totals it was denied.
        lineItems: surchargeLineItems(
          modifiersRes.data ?? [],
          result.data.vehicle_size_class,
          conditionAnswersFromJson(result.data.condition_answers),
        ).map((line, index) => ({
          key: `prefill-${index}`,
          label: line.label,
          amountCents: line.amountCents,
        })),
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

  // §7 "photos unusable": send it back with a note rather than declining.
  const handleAskForMore = useCallback(async () => {
    if (!booking) return;
    setIsSubmitting(true);
    const result = await requestMorePhotos(booking.id, askNote.trim());
    setIsSubmitting(false);
    if (result.error) {
      Alert.alert('Could not send', result.error.message);
      return;
    }
    setShowAskSheet(false);
    Alert.alert(
      'Sent to the customer',
      'The request will come back to you when they reply.',
      [{ text: 'Done', onPress: () => router.back() }],
    );
  }, [booking, askNote, router]);

  const handleDecline = useCallback(() => {
    if (!booking) return;
    Alert.alert(
      'Decline this request?',
      'The customer is told you cannot take it. Nothing has been charged, so there is no refund or penalty.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            const result = await providerCancelBooking(booking.id);
            setIsSubmitting(false);
            if (result.error) {
              Alert.alert('Could not decline', result.error.message);
              return;
            }
            router.back();
          },
        },
      ],
    );
  }, [booking, router]);

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
  const intakePhotos = photos.filter((p) => p.photo_type === 'intake');
  const quotable = (QUOTABLE_STATUSES as readonly string[]).includes(booking.status);
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

        {/* §3: the request card leads with the photos. */}
        <Spacer size="md" />
        <Card>
          <Text variant="label" color="charcoal">
            Photos from the customer ({intakePhotos.length})
          </Text>
          <Spacer size="sm" />
          {intakePhotos.length === 0 ? (
            <Text variant="caption" color="midGray">
              No photos yet. Ask for some if you need to see the car to price it.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {intakePhotos.map((photo, index) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.storage_url }}
                    style={[styles.photo, { backgroundColor: palette.midGray + '22' }]}
                    accessibilityLabel={`Customer photo ${index + 1}`}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </Card>

        {booking.status === 'awaiting_customer_info' && (
          <>
            <Spacer size="md" />
            <Card>
              <Text variant="label" color="charcoal">
                Sent back to the customer
              </Text>
              {booking.info_request_note ? (
                <Text variant="body" color="midGray">
                  You asked: “{booking.info_request_note}”
                </Text>
              ) : null}
              <Text variant="caption" color="midGray">
                You can still quote it now if you have what you need.
              </Text>
            </Card>
          </>
        )}

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

        {quotable ? (
          <>
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
              testID="send-quote"
            />
            {booking.status === 'pending_provider_quote' && (
              <>
                <Spacer size="sm" />
                <Button
                  label="Ask the Customer for More"
                  variant="secondary"
                  size="md"
                  onPress={() => {
                    setAskNote('');
                    setShowAskSheet(true);
                  }}
                  disabled={isSubmitting}
                  testID="ask-for-more"
                />
              </>
            )}
            <Spacer size="sm" />
            <Button
              label="Decline Request"
              variant="ghost"
              size="md"
              onPress={handleDecline}
              disabled={isSubmitting}
              testID="decline-request"
            />
          </>
        ) : (
          <Card>
            <Text variant="body" color="midGray" style={styles.centeredText}>
              This request is no longer waiting on your quote.
            </Text>
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={showAskSheet}
        onClose={() => setShowAskSheet(false)}
        title="Ask the customer"
      >
        <View>
          <Text variant="body" color="midGray">
            The request goes back to them with your note. It returns to you
            when they reply — nothing is charged either way.
          </Text>
          <Spacer size="md" />
          <TextField
            label="What do you need?"
            value={askNote}
            onChangeText={(text) => setAskNote(text.slice(0, MAX_INFO_REQUEST_NOTE_LENGTH))}
            placeholder="A photo of the back seats, and could you do Thursday instead?"
            multiline
            testID="ask-note"
          />
          <Spacer size="lg" />
          <Button
            label="Send to Customer"
            variant="primary"
            size="lg"
            onPress={handleAskForMore}
            loading={isSubmitting}
            disabled={askNote.trim().length === 0}
            testID="ask-send"
          />
        </View>
      </Sheet>
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
  photoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.input,
  },
});
