// Onboarding step 4 — Review & submit.
//
// Displays everything captured in useSignUpDraftStore (profile, role,
// vehicle) and on Confirm writes the users row, the primary vehicle
// row (skipped for provider-only signups), updates useAuthStore with
// the freshly inserted user, and resets the draft. The root auth gate
// in app/_layout.tsx then routes the user into (tabs)/search.

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
import { StepIndicator } from '../../../src/components/auth/StepIndicator';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import { useAuthStore } from '../../../src/state/auth';
import type { UserRole } from '../../../src/state/auth';
import {
  insertUser,
  insertVehicle,
} from '../../../src/lib/supabase/mutations';
import type {
  UserInsert,
  VehicleInsert,
} from '../../../src/types/models';

const STEP_INDEX = 3;

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Book services',
  provider: 'Offer services',
  both: 'Both',
};

export default function OnboardingReviewScreen(): React.ReactElement {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const fullName = useSignUpDraftStore((s) => s.fullName);
  const role = useSignUpDraftStore((s) => s.role);
  const vehicle = useSignUpDraftStore((s) => s.vehicle);
  const setStep = useSignUpDraftStore((s) => s.setStep);
  const reset = useSignUpDraftStore((s) => s.reset);

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
    // Provider-only signups skipped the vehicle step — send them back
    // to the role screen instead of an empty vehicle screen.
    if (role === 'provider') {
      setStep('role');
      router.replace('/(auth)/onboarding/role');
      return;
    }
    setStep('vehicle');
    router.back();
  }

  async function handleSubmit(): Promise<void> {
    if (submitting) return;
    setError(null);

    if (!session?.user) {
      setError('Your session expired. Please sign in again.');
      return;
    }
    if (!role) {
      setError('Please choose how you plan to use CarApp.');
      return;
    }
    if (needsVehicle) {
      if (
        !vehicle.year.trim() ||
        !vehicle.make.trim() ||
        !vehicle.model.trim()
      ) {
        setError('Vehicle year, make, and model are required.');
        return;
      }
    }

    setSubmitting(true);

    const authUser = session.user;
    const insertPayload: UserInsert = {
      id: authUser.id,
      email: authUser.email ?? null,
      phone: authUser.phone ?? null,
      full_name: fullName.trim(),
      role,
      email_verified: Boolean(authUser.email),
      phone_verified: Boolean(authUser.phone),
    };

    const userResult = await insertUser(insertPayload);

    if (userResult.error || !userResult.data) {
      setSubmitting(false);
      setError(
        userResult.error?.message ??
          'Could not save your profile. Please try again.',
      );
      return;
    }

    const newUser = userResult.data;

    if (needsVehicle) {
      const vehiclePayload: VehicleInsert = {
        user_id: newUser.id,
        year: vehicle.year.trim(),
        make: vehicle.make.trim(),
        model: vehicle.model.trim(),
        trim: vehicle.trim?.trim() || null,
        color: vehicle.color?.trim() || null,
        license_plate: vehicle.licensePlate?.trim() || null,
        is_primary: true,
      };
      const vehicleResult = await insertVehicle(vehiclePayload);

      if (vehicleResult.error) {
        // The user row is saved, so we don't block the user from
        // entering the app — they can add the vehicle later from
        // Account. Surface a soft warning before routing onward.
        setError(
          'Profile saved, but we could not save your vehicle. You can add it later in Account.',
        );
      }
    }

    // Hand the new user row to the auth store so the root gate
    // routes into (tabs)/search instead of looping back to (auth)/.
    setSession(session, newUser);
    reset();
    setSubmitting(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StepIndicator
        totalSteps={SIGN_UP_STEPS.length}
        currentStep={STEP_INDEX}
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
            onPress={handleBack}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.secondary,
              submitting && styles.secondaryDisabled,
              pressed && !submitting && styles.secondaryPressed,
            ]}
            testID="onboarding-review-back"
          >
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
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
              <Text style={styles.primaryText}>Confirm</Text>
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
    color: tokens.colors.light.deepIndigo,
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
    flexDirection: 'row',
    gap: tokens.spacing.md,
    marginTop: 'auto',
  },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: tokens.borderRadius.button,
    borderWidth: 1,
    borderColor: tokens.colors.light.deepIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDisabled: {
    opacity: 0.5,
  },
  secondaryPressed: {
    opacity: 0.7,
  },
  secondaryText: {
    ...textStyles.subheading,
    color: tokens.colors.light.deepIndigo,
  },
  primary: {
    flex: 2,
    minHeight: 48,
    borderRadius: tokens.borderRadius.button,
    backgroundColor: tokens.colors.light.electricBlue,
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
