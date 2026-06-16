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
import { OnboardingHeader } from '../../../src/components/auth/OnboardingHeader';
import { RoleSelector } from '../../../src/components/auth/RoleSelector';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import type { UserRole } from '../../../src/state/auth';

const STEP_INDEX = 0;

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

  function handleContinue(): void {
    if (role === null) return;
    // Role is the first step; everyone moves to the profile step next.
    // Provider-only accounts branch to the review screen from there.
    setStep('profile');
    router.push('/(auth)/onboarding/profile');
  }

  const canSubmit = role !== null;
  const continueLabel =
    role === 'customer'
      ? 'Continue as Customer  →'
      : role === 'provider'
        ? 'Continue as Provider  →'
        : role === 'both'
          ? 'Continue  →'
          : 'Continue  →';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <OnboardingHeader
        currentStep={STEP_INDEX}
        totalSteps={SIGN_UP_STEPS.length}
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
            <Text style={styles.primaryText}>{continueLabel}</Text>
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
    color: tokens.colors.light.charcoal,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: tokens.colors.light.midGray,
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
