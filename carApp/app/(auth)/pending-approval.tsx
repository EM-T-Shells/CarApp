// Pending Approval screen — shown to a signed-in provider whose
// `provider_vetting.verification_status` is not yet `approved`.
// Surfaces which of the six vetting steps are still outstanding and
// lets the user sign out or contact support.
//
// The screen reads the current vetting statuses from
// useProviderDraftStore — the dashboard mirrors the persisted
// provider_vetting row into the draft store so this screen and the
// vetting flow share one source of truth.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import tokens from '../../src/design/tokens';
import { textStyles } from '../../src/design/typography';
import { signOut } from '../../src/lib/supabase/auth';
import { useAuthStore } from '../../src/state/auth';
import {
  useProviderDraftStore,
  type VettingStepStatus,
  type VettingStatuses,
} from '../../src/state/providerDraft';

interface VettingRow {
  key: keyof VettingStatuses;
  label: string;
  description: string;
}

const ROWS: readonly VettingRow[] = [
  {
    key: 'identity',
    label: 'Identity verification',
    description: 'Confirm your identity with Persona.',
  },
  {
    key: 'background',
    label: 'Background check',
    description: 'Checkr runs a standard background screen.',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    description: 'Upload current liability coverage.',
  },
  {
    key: 'credentials',
    label: 'Credentials',
    description: 'Certifications, licenses, or trade credentials.',
  },
  {
    key: 'bank',
    label: 'Bank account',
    description: 'Connect a Stripe account to receive payouts.',
  },
] as const;

function statusLabel(status: VettingStepStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'submitted':
      return 'Under review';
    case 'pending':
      return 'In progress';
    case 'rejected':
      return 'Needs attention';
    case 'not_started':
      return 'Not started';
  }
}

function statusColor(status: VettingStepStatus): string {
  switch (status) {
    case 'approved':
      return tokens.colors.light.emeraldGreen;
    case 'submitted':
    case 'pending':
      return tokens.colors.light.gearGold;
    case 'rejected':
      return '#D92B2B';
    case 'not_started':
      return tokens.colors.light.midGray;
  }
}

export default function PendingApprovalScreen(): React.ReactElement {
  const fullName = useAuthStore((s) => s.user?.full_name ?? null);
  const statuses = useProviderDraftStore((s) => s.statuses);
  const clearAuth = useAuthStore((s) => s.clear);

  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut(): Promise<void> {
    setError(null);
    setSigningOut(true);
    const result = await signOut();
    setSigningOut(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    clearAuth();
    // Root auth gate handles navigation from here.
  }

  const approvedCount = ROWS.reduce(
    (count, row) => count + (statuses[row.key] === 'approved' ? 1 : 0),
    0,
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>You&apos;re almost there</Text>
          <Text style={styles.subtitle}>
            {fullName ? `Hi ${fullName}, ` : ''}we&apos;re reviewing your
            provider application. You&apos;ll be able to accept bookings once
            all six steps are approved.
          </Text>
          <Text style={styles.progress}>
            {approvedCount} of {ROWS.length} approved
          </Text>
        </View>

        <View style={styles.list}>
          {ROWS.map((row) => {
            const status = statuses[row.key];
            return (
              <View
                key={row.key}
                style={styles.row}
                accessible
                accessibilityLabel={`${row.label}: ${statusLabel(status)}`}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowDescription}>{row.description}</Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    { borderColor: statusColor(status) },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: statusColor(status) },
                    ]}
                  >
                    {statusLabel(status)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.help}>
          <Text style={styles.helpTitle}>Need help?</Text>
          <Text style={styles.helpText}>
            Reach out to support@carapp.example and we&apos;ll walk you through
            any outstanding step.
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutPressed,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {signingOut ? (
            <ActivityIndicator color={tokens.colors.light.deepIndigo} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.light.offWhite,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
    gap: tokens.spacing.xl,
  },
  header: {
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.xl,
  },
  title: {
    ...textStyles.displayMedium,
    color: tokens.colors.light.deepIndigo,
  },
  subtitle: {
    ...textStyles.body,
    color: tokens.colors.light.midGray,
  },
  progress: {
    ...textStyles.label,
    color: tokens.colors.light.deepIndigo,
  },
  list: {
    gap: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.base,
    borderRadius: tokens.borderRadius.card,
    backgroundColor: tokens.colors.light.offWhite,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    minHeight: 64,
  },
  rowText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  rowLabel: {
    ...textStyles.subheading,
    color: tokens.colors.light.charcoal,
  },
  rowDescription: {
    ...textStyles.bodySmall,
    color: tokens.colors.light.midGray,
  },
  badge: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.borderRadius.button,
    borderWidth: 1,
  },
  badgeText: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  help: {
    padding: tokens.spacing.base,
    backgroundColor: tokens.colors.light.offWhite,
    borderRadius: tokens.borderRadius.card,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    gap: tokens.spacing.xs,
  },
  helpTitle: {
    ...textStyles.label,
    color: tokens.colors.light.deepIndigo,
  },
  helpText: {
    ...textStyles.bodySmall,
    color: tokens.colors.light.midGray,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: '#D92B2B',
    textAlign: 'center',
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: tokens.borderRadius.button,
    borderWidth: 1,
    borderColor: tokens.colors.light.deepIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutPressed: {
    opacity: 0.85,
  },
  signOutText: {
    ...textStyles.subheading,
    color: tokens.colors.light.deepIndigo,
  },
});
