// (provider-tabs)/earnings — provider earnings + kudos (Flows 5.7 / 5.8).
//
// Hosts the EarningsDashboard (payout summary + history) and a read-only Kudos
// history (badges customers have awarded). This is the Earnings tab root in the
// provider dashboard. Earnings come from the payouts table; kudos from the
// kudos table keyed by the provider's user id.
//
// Moved from (tabs)/more/provider-earnings.tsx when the provider dashboard got
// its own tab bar — it now renders its own header instead of a Stack header.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { EarningsDashboard } from '../../../src/components/provider/EarningsDashboard';
import { KudosDisplay } from '../../../src/components/kudos/KudosDisplay';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getProviderByUserId,
  getKudosForProviderUser,
} from '../../../src/lib/supabase/queries';
import type { Kudos } from '../../../src/types/models';

export default function ProviderEarningsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [kudos, setKudos] = useState<Kudos[]>([]);

  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const [profileRes, kudosRes] = await Promise.all([
      getProviderByUserId(user.id),
      getKudosForProviderUser(user.id),
    ]);
    if (profileRes.error || !profileRes.data) {
      setError(profileRes.error?.message ?? 'Provider profile not found.');
      setLoading(false);
      return;
    }
    setProviderId(profileRes.data.id);
    if (!kudosRes.error) setKudos(kudosRes.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <Text variant="heading" color="charcoal">
            Earnings
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !providerId) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <Text variant="heading" color="charcoal">
            Earnings
          </Text>
        </View>
        <View style={styles.centered}>
          <Text variant="subheading" color="charcoal">
            Couldn&apos;t load earnings
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error ?? 'Please try again.'}
          </Text>
          <Spacer size="lg" />
          <Button label="Retry" variant="primary" size="md" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text variant="heading" color="charcoal">
          Earnings
        </Text>
      </View>
      <ScrollView
        style={{ backgroundColor: palette.offWhite }}
        contentContainerStyle={styles.content}
      >
        <EarningsDashboard providerId={providerId} />

        <Spacer size="xl" />
        <Text variant="label" color="charcoal">
          Kudos from customers
        </Text>
        <Spacer size="sm" />
        {kudos.length === 0 ? (
          <Card variant="outlined">
            <Text variant="body" color="midGray">
              No kudos yet. Deliver standout work and customers can award you
              badges after a job.
            </Text>
          </Card>
        ) : (
          <Card variant="outlined">
            <KudosDisplay kudos={kudos} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
  },
  centeredText: { textAlign: 'center', maxWidth: 300 },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
});
