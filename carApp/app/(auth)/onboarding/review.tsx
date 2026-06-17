// Onboarding final step (provider-only) — Review & submit.
//
// Customer / both accounts finish on the vehicle step; only provider-only
// signups reach this screen (branched from the profile step). On Confirm
// it runs submitSignUp() to write the users row and reset the draft. The
// root auth gate in app/_layout.tsx then routes the provider onward.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import tokens from '../../../src/design/tokens';
import { textStyles } from '../../../src/design/typography';
import { OnboardingHeader } from '../../../src/components/auth/OnboardingHeader';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import type { UserRole } from '../../../src/state/auth';
import { submitSignUp } from '../../../src/state/signUpSubmit';

const STEP_INDEX = 2;

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Book services',
  provider: 'Offer services',
  both: 'Both',
};

export default function OnboardingReviewScreen(): React.ReactElement {
  const router = useRouter();

  const fullName = useSignUpDraftStore((s) => s.fullName);
  const phone = useSignUpDraftStore((s) => s.phone);
  const role = useSignUpDraftStore((s) => s.role);
  const vehicle = useSignUpDraftStore((s) => s.vehicle);
  const setStep = useSignUpDraftStore((s) => s.setStep);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsVehicle = role === 'customer' || role === 'both';

  const vehicleDescription = useMemo(() => {
    const parts = [
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.trim,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.join(' ').trim();
  }, [vehicle]);

  function handleBack(): void {
    setStep('profile');
    router.back();
  }

  async function handleSubmit(): Promise<void> {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const result = await submitSignUp();
    if (!result.ok) {
      setSubmitting(false);
      setError(result.error ?? 'Could not finish setup. Please try again.');
      return;
    }
    // On success the auth store holds the new users row, so the root gate
    // routes the provider onward. Leave submitting true through the
    // transition so the button stays disabled.
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <OnboardingHeader
        onBack={submitting ? undefined : handleBack}
        currentStep={STEP_INDEX}
        totalSteps={SIGN_UP_STEPS.length}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Review your details</Text>
          <Text style={styles.subtitle}>
            One last look before we set up your account.
          </Text>
        </View>

        <View style={styles.card}>
          <Row label="Full name" value={fullName || '—'} />
          <Divider />
          <Row label="Phone" value={phone || '—'} />
          <Divider />
          <Row
            label="Account type"
            value={role ? ROLE_LABELS[role] : '—'}
          />
          {needsVehicle ? (
            <>
              <Divider />
              <Row
                label="Vehicle"
                value={vehicleDescription || '—'}
              />
              {vehicle.color || vehicle.licensePlate ? (
                <Row
                  label=""
                  value={[vehicle.color, vehicle.licensePlate]
                    .filter(Boolean)
                    .join(' • ')}
                  muted
                />
              ) : null}
            </>
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Confirm and create account"
            style={({ pressed }) => [
              styles.primary,
              submitting && styles.primaryDisabled,
              pressed && !submitting && styles.primaryPressed,
            ]}
            testID="onboarding-review-confirm"
          >
            {submitting ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.primaryText}>Confirm  →</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: string;
  muted?: boolean;
}

function Row({ label, value, muted }: RowProps): React.ReactElement {
  return (
    <View style={styles.row}>
      {label ? <Text style={styles.rowLabel}>{label}</Text> : null}
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>
        {value}
      </Text>
    </View>
  );
}

function Divider(): React.ReactElement {
  return <View style={styles.divider} />;
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
    paddingBottom: tokens.spacing['2xl'],
    gap: tokens.spacing.xl,
  },
  header: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  title: {
    ...textStyles.displayMedium,
    color: tokens.colors.light.charcoal,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: tokens.colors.light.midGray,
  },
  card: {
    borderRadius: tokens.borderRadius.card,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    backgroundColor: tokens.colors.light.offWhite,
    paddingVertical: tokens.spacing.sm,
  },
  row: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.base,
    gap: tokens.spacing.xs,
  },
  rowLabel: {
    ...textStyles.caption,
    color: tokens.colors.light.midGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowValue: {
    ...textStyles.bodyLarge,
    color: tokens.colors.light.charcoal,
  },
  rowValueMuted: {
    ...textStyles.body,
    color: tokens.colors.light.midGray,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.light.midGray,
    opacity: 0.25,
    marginHorizontal: tokens.spacing.base,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: '#D92B2B',
  },
  footer: {
    marginTop: 'auto',
  },
  primary: {
    minHeight: 52,
    borderRadius: tokens.borderRadius.button,
    backgroundColor: tokens.colors.light.deepIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryPressed: {
    opacity: 0.85,
  },
  primaryText: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
});
