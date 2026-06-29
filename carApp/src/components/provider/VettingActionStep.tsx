// VettingActionStep (Flows 4.3 / 4.6) — shared body for action-based vetting
// steps that aren't a document upload (background check, bank connect). Loads
// the provider + current status, renders an explanation + a primary action
// button, and reflects whatever status the host's onAction resolves to.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { useAuthStore } from '../../state/auth';
import { getProviderByUserId, getProviderVetting } from '../../lib/supabase/queries';

type StatusValue = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface VettingActionResult {
  status?: StatusValue;
  error?: string;
}

export interface VettingActionStepProps {
  statusField: 'background_status' | 'bank_status';
  title: string;
  description: string;
  actionLabel: string;
  /** Performs the step's work (mutations) and resolves the new status or an error. */
  onAction: (providerId: string, userId: string) => Promise<VettingActionResult>;
  /** Overrides the default "in progress" copy shown while status is `submitted`. */
  submittedMessage?: string;
}

const STATUS_COPY: Record<StatusValue, string> = {
  pending: 'Not started',
  submitted: 'Under review',
  approved: 'Approved',
  rejected: 'Needs attention',
};

export function VettingActionStep({
  statusField,
  title,
  description,
  actionLabel,
  onAction,
  submittedMessage,
}: VettingActionStepProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusValue>('pending');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) return;
    (async () => {
      const profile = await getProviderByUserId(user.id);
      if (!active || !profile.data) {
        setLoading(false);
        return;
      }
      setProviderId(profile.data.id);
      const vetting = await getProviderVetting(profile.data.id);
      if (!active) return;
      const current = vetting.data?.[statusField] as StatusValue | undefined;
      if (current) setStatus(current);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, statusField]);

  const handlePress = useCallback(async (): Promise<void> => {
    if (!providerId || !user) return;
    setWorking(true);
    const result = await onAction(providerId, user.id);
    setWorking(false);
    if (result.error) {
      Alert.alert('Not available yet', result.error);
      return;
    }
    if (result.status) setStatus(result.status);
  }, [providerId, user, onAction]);

  const statusColor =
    status === 'approved'
      ? palette.emeraldGreen
      : status === 'submitted'
        ? palette.gearGold
        : status === 'rejected'
          ? '#D92B2B'
          : palette.midGray;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: palette.offWhite }} contentContainerStyle={styles.content}>
      <View style={styles.statusRow}>
        <Text variant="heading" color="charcoal" style={styles.flex}>
          {title}
        </Text>
        <View style={[styles.badge, { borderColor: statusColor }]}>
          <Text variant="caption" style={{ color: statusColor }}>
            {STATUS_COPY[status]}
          </Text>
        </View>
      </View>

      <Spacer size="sm" />
      <Text variant="body" color="midGray">
        {description}
      </Text>

      <Spacer size="lg" />
      {status === 'approved' ? (
        <Card variant="outlined">
          <Text variant="bodySmall" color="midGray">
            This step is complete.
          </Text>
        </Card>
      ) : (
        <Button
          label={actionLabel}
          variant="primary"
          size="lg"
          loading={working}
          onPress={handlePress}
          testID="vetting-action"
        />
      )}

      {status === 'submitted' ? (
        <>
          <Spacer size="md" />
          <Card variant="outlined">
            <Text variant="bodySmall" color="midGray">
              {submittedMessage ??
                "In progress — we'll update this step when it completes."}
            </Text>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

export default VettingActionStep;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 20, borderWidth: 1 },
});
