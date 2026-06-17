// VettingUploadStep (Flows 4.4 / 4.5) — shared body for the upload-based vetting
// steps (insurance, credentials). Loads the provider + current vetting status,
// renders an explanation, a CredentialUpload control, and a status badge. On a
// successful upload it sets the relevant *_status to 'submitted' (admin approves
// manually later), per the flow spec.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { CredentialUpload } from './CredentialUpload';
import { colors, spacing } from '../../design/tokens';
import { useAuthStore } from '../../state/auth';
import { getProviderByUserId, getProviderVetting } from '../../lib/supabase/queries';
import { updateProviderVetting } from '../../lib/supabase/mutations';
import type { ProviderVettingUpdate } from '../../types/models';

type StatusValue = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface VettingUploadStepProps {
  docLabel: string;
  /** Which provider_vetting column this step drives. */
  statusField: 'insurance_status' | 'credentials_status' | 'identity_status' | 'background_status';
  title: string;
  description: string;
  uploadLabel: string;
}

const STATUS_COPY: Record<StatusValue, string> = {
  pending: 'Not submitted',
  submitted: 'Under review',
  approved: 'Approved',
  rejected: 'Needs attention',
};

export function VettingUploadStep({
  docLabel,
  statusField,
  title,
  description,
  uploadLabel,
}: VettingUploadStepProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusValue>('pending');

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

  const handleUploaded = useCallback(async (): Promise<void> => {
    if (!providerId) return;
    const update = { [statusField]: 'submitted' } as ProviderVettingUpdate;
    const res = await updateProviderVetting(providerId, update);
    if (!res.error) setStatus('submitted');
  }, [providerId, statusField]);

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
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
    >
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
      {providerId && user ? (
        <CredentialUpload
          userId={user.id}
          docLabel={docLabel}
          label={uploadLabel}
          onUploaded={handleUploaded}
          disabled={status === 'approved'}
        />
      ) : null}

      {status === 'submitted' ? (
        <>
          <Spacer size="md" />
          <Card variant="outlined">
            <Text variant="bodySmall" color="midGray">
              Thanks! Our team will review your document and update this step.
            </Text>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

export default VettingUploadStep;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 20, borderWidth: 1 },
});
