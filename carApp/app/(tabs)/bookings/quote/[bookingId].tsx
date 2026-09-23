// Customer quote approval — the moment money enters the quote flow.
//
// Shows the provider's itemised price, then approves it in two steps that must
// stay separate:
//
//   1. acceptQuote() — the server writes total_amount, deposit_amount,
//      platform_fee and provider_payout together and returns the booking to
//      'pending'. Charges nothing. Returns next: 'requires_deposit'.
//   2. createDepositPaymentIntent() + presentDepositPaymentSheet() — the
//      existing deposit flow, unchanged.
//
// The client never asserts the payment succeeded (.claude/rules/stripe-payments).
// PaymentSheet returning without error means Stripe accepted the card, not that
// the booking is confirmed — only stripe-events moves it, and for a quote-first
// booking it confirms outright rather than entering the approval window.
//
// The amounts come from the server, never recomputed here: on a re-quote the
// deposit is NOT 15% of the new total, because an already-succeeded deposit is
// kept as recorded so the balance still sums to what was agreed.

import React, { useCallback, useEffect, useState } from 'react';
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
import { colors, spacing } from '../../../../src/design/tokens';
import { getBookingById } from '../../../../src/lib/supabase/queries';
import {
  acceptQuote,
  createDepositPaymentIntent,
  presentDepositPaymentSheet,
} from '../../../../src/lib/stripe';
import type { BookingSummary } from '../../../../src/lib/supabase/queries';
import type { BookingTrackingParams } from '../../../../src/types/navigation';
import { centsToDisplay } from '../../../../src/utils/money';
import { formatDate, formatTime } from '../../../../src/utils/date';
import { formatDuration } from '../../../../src/utils/duration';

/** A line as submit_quote stored it. Cents, per the JSONB grammar. */
interface StoredLineItem {
  label: string;
  amount_cents: number;
}

export default function QuoteApprovalScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<BookingTrackingParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getBookingById(bookingId);
    if (result.error) {
      setLoadError(result.error);
    } else {
      setBooking(result.data);
    }
    setIsLoading(false);
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = useCallback(async () => {
    if (!booking) return;

    setIsApproving(true);

    // Step 1 — approve. Writes the money columns; charges nothing.
    const approved = await acceptQuote(booking.id);

    if (approved.error) {
      setIsApproving(false);
      // The 409s here are ones the customer must be able to tell apart: the
      // provider re-quoted while this screen was open, or the request was
      // cancelled. Refetch so they are looking at the current price.
      Alert.alert('Could not approve', approved.error.message, [
        { text: 'Refresh', onPress: () => load() },
      ]);
      return;
    }

    // The server names the next step rather than the client inferring it.
    if (approved.data.next !== 'requires_deposit') {
      setIsApproving(false);
      await load();
      return;
    }

    // Step 2 — the existing deposit flow, unchanged.
    const intent = await createDepositPaymentIntent(
      booking.id,
      approved.data.deposit_cents ?? 0,
    );

    if (intent.error) {
      setIsApproving(false);
      // The quote stays approved and the booking sits at 'pending'. Retrying
      // the deposit is the recovery, not re-approving — so refresh rather than
      // unwinding anything.
      Alert.alert('Payment setup failed', intent.error.message, [
        { text: 'OK', onPress: () => load() },
      ]);
      return;
    }

    const paid = await presentDepositPaymentSheet(intent.data);
    setIsApproving(false);

    if (paid.error) {
      Alert.alert('Payment failed', paid.error.message, [
        { text: 'OK', onPress: () => load() },
      ]);
      return;
    }

    if (paid.data.canceled) {
      // Dismissed the sheet. Nothing is charged and the booking stays at
      // 'pending' with the approved price on it, so they can pay later.
      await load();
      return;
    }

    // Deliberately NOT asserting the booking is confirmed. stripe-events is
    // what moves it, on the signed webhook, and it confirms a quote-first
    // booking outright. Send them to the booking and let the row speak.
    router.replace(`/bookings/${booking.id}`);
  }, [booking, load, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator color={palette.electricBlue} />
      </SafeAreaView>
    );
  }

  if (loadError || !booking) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="body" color="charcoal" style={styles.centeredText}>
          {loadError?.message ?? 'Quote not found'}
        </Text>
      </SafeAreaView>
    );
  }

  if (booking.status !== 'pending_customer_approval') {
    // Reached after the provider re-quoted, or after approving in another tab.
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="body" color="charcoal" style={styles.centeredText}>
          This quote is no longer waiting on you.
        </Text>
        <Spacer size="md" />
        <Button
          label="View booking"
          variant="secondary"
          onPress={() => router.replace(`/bookings/${booking.id}`)}
        />
      </SafeAreaView>
    );
  }

  const lineItems = parseLineItems(booking.quote_line_items);
  const quotedCents = Math.round(Number(booking.quoted_total_amount ?? 0) * 100);
  const surcharges = lineItems.reduce((sum, l) => sum + l.amount_cents, 0);
  const baseCents = quotedCents - surcharges;
  const providerName = booking.provider_profiles?.users?.full_name ?? 'Your provider';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading" color="charcoal">
          {providerName} sent your price
        </Text>
        <Spacer size="md" />

        {/* ── When ───────────────────────────────────────────────── */}
        <Card>
          <View style={styles.row}>
            <Text variant="body" color="midGray">
              Arriving
            </Text>
            <Text variant="body" color="charcoal">
              {formatDate(booking.scheduled_at)}, {formatTime(booking.scheduled_at)}
            </Text>
          </View>
          {booking.estimated_duration_mins != null && (
            <View style={styles.row}>
              <Text variant="body" color="midGray">
                Estimated time
              </Text>
              <Text variant="body" color="charcoal">
                {formatDuration(booking.estimated_duration_mins)}
              </Text>
            </View>
          )}
        </Card>

        <Spacer size="md" />

        {/* ── The price, itemised ────────────────────────────────── */}
        <Card>
          <View style={styles.row}>
            <Text variant="body" color="midGray">
              Service
            </Text>
            <Text variant="body" color="charcoal">
              {centsToDisplay(baseCents)}
            </Text>
          </View>

          {lineItems.map((line, i) => (
            <View key={`${line.label}-${i}`} style={styles.row}>
              <Text variant="body" color="midGray" style={styles.lineLabel}>
                {line.label}
              </Text>
              <Text variant="body" color="charcoal">
                {centsToDisplay(line.amount_cents)}
              </Text>
            </View>
          ))}

          <Spacer size="sm" />
          <View style={styles.row}>
            <Text variant="subheading" color="charcoal">
              Total
            </Text>
            <Text variant="subheading" color="charcoal" testID="quote-approval-total">
              {centsToDisplay(quotedCents)}
            </Text>
          </View>
        </Card>

        <Spacer size="md" />

        <Card>
          <Text variant="caption" color="midGray">
            Approving charges a deposit now and the balance when the job is
            done. The exact deposit is shown in the payment sheet.
          </Text>
        </Card>

        <Spacer size="xl" />

        <Button
          label="Approve & Pay Deposit"
          variant="primary"
          size="lg"
          onPress={handleApprove}
          loading={isApproving}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * quote_line_items is JSONB and the grammar trigger guarantees its shape on
 * write, but a row could predate the trigger, so this stays defensive rather
 * than casting. A malformed array renders as no surcharges instead of crashing
 * the approval screen — the worst possible place to throw.
 */
export function parseLineItems(value: unknown): StoredLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const label = (item as { label?: unknown }).label;
    const amount = (item as { amount_cents?: unknown }).amount_cents;
    if (typeof label !== 'string' || typeof amount !== 'number') return [];
    if (!Number.isFinite(amount)) return [];
    return [{ label, amount_cents: Math.round(amount) }];
  });
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  lineLabel: {
    flex: 1,
    marginRight: spacing.sm,
  },
});
