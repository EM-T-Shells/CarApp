// Onboarding step 2 — Profile.
//
// After choosing a role, the new user enters their contact details:
// full name and phone (required for everyone), plus a mailing address
// for customer / both accounts (used to match them with nearby
// providers). Writes through useSignUpDraftStore.setProfile and advances
// to the vehicle step (customer / both) or the review screen (provider).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { OnboardingHeader } from '../../../src/components/auth/OnboardingHeader';
import {
  SIGN_UP_STEPS,
  useSignUpDraftStore,
} from '../../../src/state/signUpDraft';
import { useAuthStore } from '../../../src/state/auth';
import {
  isValidFullName,
  isValidPhone,
  isRequired,
} from '../../../src/utils/validators';

const STEP_INDEX = 1;

type FieldKey =
  | 'fullName'
  | 'phone'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'postalCode';

export default function OnboardingProfileScreen(): React.ReactElement {
  const router = useRouter();
  const role = useSignUpDraftStore((s) => s.role);
  const setProfile = useSignUpDraftStore((s) => s.setProfile);
  const setStep = useSignUpDraftStore((s) => s.setStep);
  const sessionPhone = useAuthStore((s) => s.session?.user?.phone ?? '');

  const isCustomerLike = role === 'customer' || role === 'both';

  const [fullName, setFullName] = useState(
    () => useSignUpDraftStore.getState().fullName,
  );
  const [phone, setPhone] = useState(
    () => useSignUpDraftStore.getState().phone || sessionPhone,
  );
  const [addressLine1, setAddressLine1] = useState(
    () => useSignUpDraftStore.getState().addressLine1,
  );
  const [addressLine2, setAddressLine2] = useState(
    () => useSignUpDraftStore.getState().addressLine2,
  );
  const [city, setCity] = useState(() => useSignUpDraftStore.getState().city);
  const [stateRegion, setStateRegion] = useState(
    () => useSignUpDraftStore.getState().state,
  );
  const [postalCode, setPostalCode] = useState(
    () => useSignUpDraftStore.getState().postalCode,
  );

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string | null>>>(
    {},
  );

  function clearError(key: FieldKey): void {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleContinue(): void {
    const nextErrors: Partial<Record<FieldKey, string | null>> = {};

    const nameResult = isValidFullName(fullName);
    if (!nameResult.valid) nextErrors.fullName = nameResult.error;

    const phoneResult = isValidPhone(phone);
    if (!phoneResult.valid) nextErrors.phone = phoneResult.error;

    if (isCustomerLike) {
      const l1 = isRequired(addressLine1, 'Street address');
      if (!l1.valid) nextErrors.addressLine1 = l1.error;
      const cityResult = isRequired(city, 'City');
      if (!cityResult.valid) nextErrors.city = cityResult.error;
      const stateResult = isRequired(stateRegion, 'State');
      if (!stateResult.valid) nextErrors.state = stateResult.error;
      const zipResult = isRequired(postalCode, 'ZIP code');
      if (!zipResult.valid) nextErrors.postalCode = zipResult.error;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setProfile({
      fullName: fullName.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim(),
      city: city.trim(),
      state: stateRegion.trim(),
      postalCode: postalCode.trim(),
    });

    if (role === 'provider') {
      router.push('/(auth)/onboarding/review');
      return;
    }
    setStep('vehicle');
    router.push('/(auth)/onboarding/vehicle');
  }

  function handleBack(): void {
    setStep('role');
    router.back();
  }

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
            <Text style={styles.title}>Your details</Text>
            <Text style={styles.subtitle}>
              {isCustomerLike
                ? 'We use your address to match you with nearby detailers and mechanics.'
                : 'How customers will reach you for bookings.'}
            </Text>
          </View>

          <Field
            label="Full name"
            value={fullName}
            onChangeText={(v) => {
              setFullName(v);
              clearError('fullName');
            }}
            placeholder="Alex Rivera"
            autoCapitalize="words"
            autoFocus
            error={errors.fullName}
            testID="onboarding-profile-name"
          />

          <Field
            label="Phone"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              clearError('phone');
            }}
            placeholder="(703) 555-0142"
            keyboardType="phone-pad"
            error={errors.phone}
            testID="onboarding-profile-phone"
          />

          {isCustomerLike ? (
            <>
              <Field
                label="Street address"
                value={addressLine1}
                onChangeText={(v) => {
                  setAddressLine1(v);
                  clearError('addressLine1');
                }}
                placeholder="123 Main St"
                autoCapitalize="words"
                error={errors.addressLine1}
                testID="onboarding-profile-address1"
              />
              <Field
                label="Apt / unit (optional)"
                value={addressLine2}
                onChangeText={setAddressLine2}
                placeholder="Apt 4B"
                autoCapitalize="words"
                testID="onboarding-profile-address2"
              />
              <Field
                label="City"
                value={city}
                onChangeText={(v) => {
                  setCity(v);
                  clearError('city');
                }}
                placeholder="Reston"
                autoCapitalize="words"
                error={errors.city}
                testID="onboarding-profile-city"
              />
              <View style={styles.row}>
                <View style={styles.rowItemSmall}>
                  <Field
                    label="State"
                    value={stateRegion}
                    onChangeText={(v) => {
                      setStateRegion(v);
                      clearError('state');
                    }}
                    placeholder="VA"
                    autoCapitalize="characters"
                    maxLength={2}
                    error={errors.state}
                    testID="onboarding-profile-state"
                  />
                </View>
                <View style={styles.rowItem}>
                  <Field
                    label="ZIP code"
                    value={postalCode}
                    onChangeText={(v) => {
                      setPostalCode(v);
                      clearError('postalCode');
                    }}
                    placeholder="20190"
                    keyboardType="number-pad"
                    maxLength={10}
                    error={errors.postalCode}
                    testID="onboarding-profile-zip"
                  />
                </View>
              </View>
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              pressed && styles.submitPressed,
            ]}
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue to next step"
            testID="onboarding-profile-continue"
          >
            <Text style={styles.submitText}>Continue  →</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
  autoFocus?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  testID,
  autoFocus,
  maxLength,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}: FieldProps): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.light.midGray}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={maxLength}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        testID={testID}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
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
    gap: tokens.spacing.lg,
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
  field: {
    gap: tokens.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  rowItemSmall: {
    width: 96,
  },
  label: {
    ...textStyles.label,
    color: tokens.colors.light.midGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    minHeight: 52,
    borderRadius: tokens.borderRadius.button,
    backgroundColor: tokens.colors.light.deepIndigo,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.sm,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitText: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
});
