// EarningsDashboard (Flow 5.7) — a provider's earnings summary + payout list.
//
// Provider earnings live in the `payouts` table (one row per completed job,
// queued by the stripe-webhook capture_balance handler). This shows lifetime
// paid earnings, the pending (queued) total, and a dated list of payout line
// items. Payout amounts are stored as decimal dollars (NUMERIC); we convert to
// integer cents for the shared money formatter.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';
import { formatShortDate } from '../../utils/date';
import { getPayoutsByProvider } from '../../lib/supabase/queries';
import type { Payout } from '../../types/models';

function dollarsToCents(amount: number | null | undefined): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

const STATUS_LABEL: Record<string, { label: string; colorKey: keyof typeof colors.light }> = {
  paid: { label: 'Paid', colorKey: 'emeraldGreen' },
  pending: { label: 'Queued', colorKey: 'gearGold' },
  failed: { label: 'Failed', colorKey: 'midGray' },
};

export interface EarningsDashboardProps {
  providerId: string;
}

export function EarningsDashboard({ providerId }: EarningsDashboardProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const res = await getPayoutsByProvider(providerId);
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setPayouts(res.data ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const paidCents = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + dollarsToCents(p.amount), 0);
  const pendingCents = payouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + dollarsToCents(p.amount), 0);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.electricBlue} />
      </View>
    );
  }

  if (error) {
    return (
      <Card variant="outlined">
        <Text variant="body" color="charcoal">
          Couldn&apos;t load earnings
        </Text>
        <Spacer size="sm" />
        <Text variant="caption" color="midGray">
          {error}
        </Text>
        <Spacer size="md" />
        <Button label="Retry" variant="secondary" size="md" onPress={load} />
      </Card>
    );
  }

  return (
    <View>
      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <Card variant="outlined" style={styles.summaryCard}>
          <Text variant="caption" color="midGray">
            Paid out
          </Text>
          <Spacer size="xs" />
          <Text variant="price" color="emeraldGreen">
            {centsToDisplay(paidCents)}
          </Text>
        </Card>
        <Card variant="outlined" style={styles.summaryCard}>
          <Text variant="caption" color="midGray">
            Pending
          </Text>
          <Spacer size="xs" />
          <Text variant="price" color="gearGold">
            {centsToDisplay(pendingCents)}
          </Text>
        </Card>
      </View>

      <Spacer size="lg" />

      <Text variant="label" color="charcoal">
        Payout history
      </Text>
      <Spacer size="sm" />

      {payouts.length === 0 ? (
        <Card variant="outlined">
          <Text variant="body" color="midGray">
            No payouts yet. Complete a job and your earnings will appear here.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {payouts.map((payout) => {
            const cfg = STATUS_LABEL[payout.status] ?? STATUS_LABEL.pending;
            const statusColor = palette[cfg.colorKey];
            const dateIso = payout.paid_at ?? null;
            return (
              <Card key={payout.id}>
                <View style={styles.payoutRow}>
                  <View style={styles.flex}>
                    <Text variant="price" color="charcoal">
                      {centsToDisplay(dollarsToCents(payout.amount))}
                    </Text>
                    <Spacer size="xs" />
                    <Text variant="caption" color="midGray">
                      {dateIso ? formatShortDate(dateIso) : 'Awaiting transfer'}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: statusColor + '22' }]}>
                    <Text variant="caption" style={{ color: statusColor }}>
                      {cfg.label}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default EarningsDashboard;

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryCard: { flex: 1 },
  list: { gap: spacing.md },
  flex: { flex: 1 },
  payoutRow: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginLeft: spacing.sm,
  },
});
