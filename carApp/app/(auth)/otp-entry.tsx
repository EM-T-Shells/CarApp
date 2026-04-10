// OTP Entry screen — collects an email or phone number, calls
// supabase.auth.signInWithOtp via src/lib/supabase/auth.ts, and on
// success routes to otp-verify with the contact preserved as a
// query param.
//
// The screen exposes a tab-style toggle for Email vs Phone. Phone is
// treated as an E.164 US number (Twilio is configured at the Supabase
// project level — see CLAUDE.md).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import tokens from '../../src/design/tokens';
import { textStyles } from '../../src/design/typography';
import { signInWithOtp } from '../../src/lib/supabase/auth';
import { isValidEmail, isValidPhone } from '../../src/utils/validators';

type OtpMethod = 'email' | 'phone';

/**
 * Strips formatting from a US phone number and returns an E.164
 * string (`+15551234567`). Assumes US if no country code is present.
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export default function OtpEntryScreen(): React.ReactElement {
  const router = useRouter();
  const [method, setMethod] = useState<OtpMethod>('email');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);

    const trimmed = contact.trim();
    const validation =
      method === 'email' ? isValidEmail(trimmed) : isValidPhone(trimmed);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);

    const target =
      method === 'email'
        ? ({ email: trimmed } as const)
        : ({ phone: toE164(trimmed) } as const);

    const result = await signInWithOtp(target);

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    const param =
      method === 'email'
        ? `method=email&email=${encodeURIComponent(trimmed)}`
        : `method=phone&phone=${encodeURIComponent(toE164(trimmed))}`;

    router.push(`/(auth)/otp-verify?${param}`);
  }

  function switchMethod(next: OtpMethod): void {
    setMethod(next);
    setContact('');
    setError(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Sign in with a code</Text>
            <Text style={styles.subtitle}>
              We&apos;ll send a one-time code to confirm it&apos;s you.
            </Text>
          </View>

          <View
            accessibilityRole="tablist"
            accessibilityLabel="Choose contact method"
            style={styles.tabs}
          >
            <MethodTab
              label="Email"
              active={method === 'email'}
              onPress={() => switchMethod('email')}
            />
            <MethodTab
              label="Phone"
              active={method === 'phone'}
              onPress={() => switchMethod('phone')}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              {method === 'email' ? 'Email address' : 'Phone number'}
            </Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              value={contact}
              onChangeText={(v) => {
                setContact(v);
                if (error) setError(null);
              }}
              placeholder={
                method === 'email' ? 'you@example.com' : '(555) 123-4567'
              }
              placeholderTextColor={tokens.colors.light.midGray}
              keyboardType={
                method === 'email' ? 'email-address' : 'phone-pad'
              }
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={method === 'email' ? 'email' : 'tel'}
              editable={!submitting}
              accessibilityLabel={
                method === 'email' ? 'Email address' : 'Phone number'
              }
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              (submitting || contact.trim().length === 0) &&
                styles.submitDisabled,
              pressed && styles.submitPressed,
            ]}
            onPress={handleSubmit}
            disabled={submitting || contact.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Send one time code"
          >
            {submitting ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.submitText}>Send code</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backButton}
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

interface MethodTabProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function MethodTab({
  label,
  active,
  onPress,
}: MethodTabProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.tabPressed,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
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
    flex: 1,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
    gap: tokens.spacing.xl,
  },
  header: {
    marginTop: tokens.spacing['2xl'],
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.light.offWhite,
    borderRadius: tokens.borderRadius.input,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.md,
  },
  tabActive: {
    backgroundColor: tokens.colors.light.deepIndigo,
  },
  tabPressed: {
    opacity: 0.85,
  },
  tabText: {
    ...textStyles.label,
    color: tokens.colors.light.deepIndigo,
  },
  tabTextActive: {
    color: tokens.colors.light.offWhite,
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
  backButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    ...textStyles.label,
    color: tokens.colors.light.deepIndigo,
  },
});
