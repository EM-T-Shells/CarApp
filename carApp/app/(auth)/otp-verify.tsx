// OTP Verify screen — accepts the 6-digit code from otp-entry, calls
// supabase.auth.verifyOtp, and lets the root _layout.tsx auth gate
// take over once a session is returned.
//
// The method + contact arrive as query params from otp-entry. The
// screen exposes a "resend" action that calls signInWithOtp again.

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
import { useLocalSearchParams, useRouter } from 'expo-router';
import tokens from '../../src/design/tokens';
import { textStyles } from '../../src/design/typography';
import { verifyOtp, signInWithOtp } from '../../src/lib/supabase/auth';

const CODE_LENGTH = 6;

type OtpMethod = 'email' | 'phone';

interface OtpVerifyParams {
  method?: string;
  email?: string;
  phone?: string;
}

function describeContact(method: OtpMethod, contact: string): string {
  if (method === 'email') return contact;
  // Mask all but the last 4 digits of a phone number
  const digits = contact.replace(/\D/g, '');
  if (digits.length < 4) return contact;
  const last = digits.slice(-4);
  return `••• ••• ${last}`;
}

export default function OtpVerifyScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<OtpVerifyParams>();

  const method: OtpMethod = params.method === 'phone' ? 'phone' : 'email';
  const contact =
    method === 'email' ? (params.email ?? '') : (params.phone ?? '');

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentNotice, setResentNotice] = useState(false);

  async function handleVerify(): Promise<void> {
    setError(null);

    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`);
      return;
    }

    if (!contact) {
      setError('Missing contact. Go back and request a new code.');
      return;
    }

    setSubmitting(true);

    const target =
      method === 'email'
        ? ({ email: contact } as const)
        : ({ phone: contact } as const);

    const result = await verifyOtp(target, code);

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    // Root auth gate handles navigation from here.
  }

  async function handleResend(): Promise<void> {
    if (!contact) return;
    setError(null);
    setResentNotice(false);
    setResending(true);

    const target =
      method === 'email'
        ? ({ email: contact } as const)
        : ({ phone: contact } as const);

    const result = await signInWithOtp(target);

    setResending(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    setResentNotice(true);
  }

  function handleCodeChange(value: string): void {
    // Only allow digits, and cap at CODE_LENGTH
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
  }

  const canSubmit = code.length === CODE_LENGTH && !submitting;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Enter your code</Text>
            <Text style={styles.subtitle}>
              We sent a {CODE_LENGTH}-digit code to{' '}
              <Text style={styles.subtitleBold}>
                {describeContact(method, contact)}
              </Text>
              .
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              value={code}
              onChangeText={handleCodeChange}
              placeholder="123456"
              placeholderTextColor={tokens.colors.light.midGray}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoFocus
              editable={!submitting}
              accessibilityLabel="Verification code"
              accessibilityHint={`${CODE_LENGTH} digit one time password`}
              textContentType="oneTimeCode"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {resentNotice ? (
              <Text style={styles.noticeText}>A new code has been sent.</Text>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && styles.submitPressed,
            ]}
            onPress={handleVerify}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Verify code"
          >
            {submitting ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.submitText}>Verify</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handleResend}
              disabled={resending}
              accessibilityRole="button"
              accessibilityLabel="Resend code"
              style={styles.linkButton}
            >
              {resending ? (
                <ActivityIndicator
                  size="small"
                  color={tokens.colors.light.deepIndigo}
                />
              ) : (
                <Text style={styles.linkText}>Resend code</Text>
              )}
            </Pressable>
          </View>
        </View>
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
  subtitleBold: {
    ...textStyles.bodyLarge,
    fontWeight: '600',
    color: tokens.colors.light.charcoal,
  },
  field: {
    gap: tokens.spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: tokens.colors.light.charcoal,
  },
  input: {
    ...textStyles.price,
    color: tokens.colors.light.charcoal,
    backgroundColor: tokens.colors.light.offWhite,
    borderRadius: tokens.borderRadius.input,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    paddingHorizontal: tokens.spacing.base,
    paddingVertical: tokens.spacing.md,
    minHeight: 56,
    textAlign: 'center',
    letterSpacing: 8,
  },
  inputError: {
    borderColor: '#D92B2B',
  },
  errorText: {
    ...textStyles.caption,
    color: '#D92B2B',
  },
  noticeText: {
    ...textStyles.caption,
    color: tokens.colors.light.emeraldGreen,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  linkText: {
    ...textStyles.label,
    color: tokens.colors.light.deepIndigo,
  },
});
