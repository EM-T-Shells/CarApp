// Onboarding step 2 — Role.
//
// New user picks "customer", "provider", or "both" via the
// RoleSelector. Customer is the default per CLAUDE.md. The choice is
// written to useSignUpDraftStore.setRole and routes to the vehicle
// step on Continue. Provider-only users skip the vehicle step.

import React, { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import tokens from '../../../src/design/tokens';
import { textStyles } from '../../../src/design/typography';
import { StepIndicator } from '../../../src/components/auth/StepIndicator';
import { RoleSelector } from '../../../src/components/auth/RoleSelector';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import type { UserRole } from '../../../src/state/auth';

const STEP_INDEX = 1;

export default function OnboardingRoleScreen(): React.ReactElement {
  const router = useRouter();
  const role = useSignUpDraftStore((s) => s.role);
  const setRole = useSignUpDraftStore((s) => s.setRole);
  const setStep = useSignUpDraftStore((s) => s.setStep);

  // Default selection to "customer" per CLAUDE.md when the user lands
  // on this step without a prior choice.
  useEffect(() => {
    if (role === null) setRole('customer');
  }, [role, setRole]);

  function handleChange(next: UserRole): void {
    setRole(next);
  }

  function handleBack(): void {
    setStep('profile');
    router.back();
  }

  function handleContinue(): void {
    if (role === null) return;

    // Provider-only signups have no personal vehicle to add — jump
    // straight to the review step where the vehicle insert is skipped.
    if (role === 'provider') {
      setStep('review');
      router.push('/(auth)/onboarding/review');
      return;
    }

    setStep('vehicle');
    router.push('/(auth)/onboarding/vehicle');
  }

  const canSubmit = role !== null;

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
          <Text style={styles.title}>How will you use CarApp?</Text>
          <Text style={styles.subtitle}>
            You can switch to Provider mode anytime later in More.
          </Text>
        </View>

        <RoleSelector value={role} onChange={handleChange} />

        <View style={styles.footer}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.secondary,
              pressed && styles.secondaryPressed,
            ]}
            testID="onboarding-role-back"
          >
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={handleContinue}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Continue to next step"
            style={({ pressed }) => [
              styles.primary,
              !canSubmit && styles.primaryDisabled,
              pressed && canSubmit && styles.primaryPressed,
            ]}
            testID="onboarding-role-continue"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </View>
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
