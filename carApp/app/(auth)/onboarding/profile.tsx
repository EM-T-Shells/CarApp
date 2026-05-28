// Onboarding step 1 — Profile.
//
// Brand-new authenticated user enters their full name. Writes through
// useSignUpDraftStore.setProfile and advances to the role step on
// Continue. The 4-step StepIndicator at the top mirrors the position
// stored in the draft store.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { StepIndicator } from '../../../src/components/auth/StepIndicator';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import { isValidFullName } from '../../../src/utils/validators';

const STEP_INDEX = 0;

export default function OnboardingProfileScreen(): React.ReactElement {
  const router = useRouter();
  const fullName = useSignUpDraftStore((s) => s.fullName);
  const setProfile = useSignUpDraftStore((s) => s.setProfile);
  const setStep = useSignUpDraftStore((s) => s.setStep);

  const [local, setLocal] = useState(fullName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(value: string): void {
    setLocal(value);
    if (error) setError(null);
  }

  function handleContinue(): void {
    const result = isValidFullName(local);
    if (!result.valid) {
      setError(result.error);
      return;
    }

    setSubmitting(true);
    setProfile({ fullName: local.trim() });
    setStep('role');
    router.push('/(auth)/onboarding/role');
    setSubmitting(false);
  }

  const canSubmit = local.trim().length >= 2 && !submitting;

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
            <Text style={styles.title}>What's your name?</Text>
            <Text style={styles.subtitle}>
              This is how providers will see you when you book a service.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              value={local}
              onChangeText={handleChange}
              placeholder="Alex Rivera"
              placeholderTextColor={tokens.colors.light.midGray}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              accessibilityLabel="Full name"
              testID="onboarding-profile-name"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && canSubmit && styles.submitPressed,
            ]}
            onPress={handleContinue}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Continue to next step"
            testID="onboarding-profile-continue"
          >
            {submitting ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.submitText}>Continue</Text>
            )}
          </Pressable>
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
  field: {
    gap: tokens.spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: tokens.colors.light.charcoal,
  },
  input: {
    ...textStyles.body,
    color: tokens.colors.light.charcoal,
    backgroundColor: tokens.colors.light.offWhite,
    borderRadius: tokens.borderRadius.input,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    paddingHorizontal: tokens.spacing.base,
    paddingVertical: tokens.spacing.md,
    minHeight: 48,
  },
  inputError: {
    borderColor: '#D92B2B',
  },
  errorText: {
    ...textStyles.caption,
    color: '#D92B2B',
  },
  submit: {
    minHeight: 48,
    borderRadius: tokens.borderRadius.button,
    backgroundColor: tokens.colors.light.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitText: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
});
