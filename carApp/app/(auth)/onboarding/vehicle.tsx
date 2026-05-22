// Onboarding step 3 — Vehicle.
//
// Customer or both-role user enters their primary vehicle (year, make,
// model, optional trim/color/plate). The shared VehicleForm writes
// directly into useSignUpDraftStore. Continue advances to the review
// step once year/make/model are filled. Provider-only signups skip
// this screen entirely (they're routed straight from role → review).

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import tokens from '../../../src/design/tokens';
import { textStyles } from '../../../src/design/typography';
import { StepIndicator } from '../../../src/components/auth/StepIndicator';
import { VehicleForm } from '../../../src/components/auth/VehicleForm';
import {
  SIGN_UP_STEPS,
  selectVehicleComplete,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
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

  function handleBack(): void {
    setStep('role');
    router.back();
  }

  function handleContinue(): void {
    // Final guard — the form already enforces these on blur, but check
    // again before advancing in case the user never blurred a field.
    const year = isValidVehicleYear(vehicle.year);
    const make = isValidVehicleMake(vehicle.make);
    const model = isValidVehicleModel(vehicle.model);
    if (!year.valid || !make.valid || !model.valid) return;

    setStep('review');
    router.push('/(auth)/onboarding/review');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StepIndicator
          totalSteps={SIGN_UP_STEPS.length}
          currentStep={STEP_INDEX}
        />
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

          <View style={styles.footer}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.secondaryPressed,
              ]}
              testID="onboarding-vehicle-back"
            >
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handleContinue}
              disabled={!isComplete}
              accessibilityRole="button"
              accessibilityLabel="Continue to review"
              style={({ pressed }) => [
                styles.primary,
                !isComplete && styles.primaryDisabled,
                pressed && isComplete && styles.primaryPressed,
              ]}
              testID="onboarding-vehicle-continue"
            >
              <Text style={styles.primaryText}>Continue</Text>
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
