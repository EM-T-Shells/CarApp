// Onboarding step 3 — Vehicle (final step for customer / both).
//
// Customer or both-role user enters their primary vehicle (year, make,
// model, optional trim/color/plate). The shared VehicleForm writes
// directly into useSignUpDraftStore. "Finish" runs submitSignUp() to
// create the users + vehicle rows; the root auth gate then routes the
// new customer into the main nav. Provider-only signups never reach this
// screen — they branch from the profile step to the review screen.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import tokens from '../../../src/design/tokens';
import { textStyles } from '../../../src/design/typography';
import { OnboardingHeader } from '../../../src/components/auth/OnboardingHeader';
import { VehicleForm } from '../../../src/components/auth/VehicleForm';
import {
  SIGN_UP_STEPS,
  selectVehicleComplete,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import { submitSignUp } from '../../../src/state/signUpSubmit';
import {
  isValidVehicleMake,
  isValidVehicleModel,
  isValidVehicleYear,
} from '../../../src/utils/validators';

const STEP_INDEX = 2;

export default function OnboardingVehicleScreen(): React.ReactElement {
  const router = useRouter();
  const vehicle = useSignUpDraftStore((s) => s.vehicle);
  const setStep = useSignUpDraftStore((s) => s.setStep);
  const isComplete = useSignUpDraftStore(selectVehicleComplete);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleBack(): void {
    setStep('profile');
    router.back();
  }

  async function handleFinish(): Promise<void> {
    if (submitting) return;
    // Final guard — the form already enforces these on blur, but check
    // again before submitting in case the user never blurred a field.
    const year = isValidVehicleYear(vehicle.year);
    const make = isValidVehicleMake(vehicle.make);
    const model = isValidVehicleModel(vehicle.model);
    if (!year.valid || !make.valid || !model.valid) return;

    setError(null);
    setSubmitting(true);
    const result = await submitSignUp();
    if (!result.ok) {
      setSubmitting(false);
      setError(result.error ?? 'Could not finish setup. Please try again.');
      return;
    }
    // On success the auth store now holds the new users row, so the root
    // gate routes into the main nav. Leave submitting true so the button
    // stays disabled through the transition.
  }

  const canSubmit = isComplete && !submitting;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <OnboardingHeader
        onBack={handleBack}
        currentStep={STEP_INDEX}
        totalSteps={SIGN_UP_STEPS.length}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Add your vehicle</Text>
            <Text style={styles.subtitle}>
              Providers use this to quote and prepare for your service.
              You can add more vehicles anytime in Account.
            </Text>
          </View>

          <VehicleForm />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.footer}>
            <Pressable
              onPress={handleFinish}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Finish and create account"
              style={({ pressed }) => [
                styles.primary,
                !canSubmit && styles.primaryDisabled,
                pressed && canSubmit && styles.primaryPressed,
              ]}
              testID="onboarding-vehicle-continue"
            >
              {submitting ? (
                <ActivityIndicator color={tokens.colors.light.offWhite} />
              ) : (
                <Text style={styles.primaryText}>Finish  →</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.light.offWhite,
  },
  flex: {
    flex: 1,
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
