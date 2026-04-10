// Sign-in screen — the single entry point for unauthenticated users.
// Offers three paths:
//
//   1. Continue with Google (OAuth via expo-auth-session)
//   2. Continue with Apple  (OAuth via expo-auth-session)
//   3. Continue with Email or Phone (navigates to otp-entry)
//
// OAuth success is picked up automatically by the root _layout.tsx
// onAuthStateChange listener — this screen does not manually navigate
// after a successful sign-in.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import tokens from '../../src/design/tokens';
import { textStyles } from '../../src/design/typography';
import { signInWithGoogle, signInWithApple } from '../../src/lib/supabase/auth';

type OAuthProvider = 'google' | 'apple';

export default function SignInScreen(): React.ReactElement {
  const router = useRouter();
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: OAuthProvider): Promise<void> {
    setError(null);
    setLoading(provider);

    const result =
      provider === 'google' ? await signInWithGoogle() : await signInWithApple();

    if (result.error) {
      setError(result.error.message);
    }
    // On success the root _layout.tsx auth gate will route us.
    setLoading(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to CarApp</Text>
          <Text style={styles.subtitle}>
            Book vetted mobile detailers and mechanics, on your terms.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonPrimary,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleOAuth('google')}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            {loading === 'google' ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.buttonPrimaryText}>Continue with Google</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonDark,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleOAuth('apple')}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            {loading === 'apple' ? (
              <ActivityIndicator color={tokens.colors.light.offWhite} />
            ) : (
              <Text style={styles.buttonDarkText}>Continue with Apple</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonOutline,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/(auth)/otp-entry')}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityLabel="Continue with email or phone"
          >
            <Text style={styles.buttonOutlineText}>
              Continue with Email or Phone
            </Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <Text style={styles.legal}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
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
    flex: 1,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
    justifyContent: 'space-between',
  },
  header: {
    marginTop: tokens.spacing['4xl'],
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
  actions: {
    gap: tokens.spacing.md,
  },
  button: {
    minHeight: 48,
    borderRadius: tokens.borderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
  },
  buttonPrimary: {
    backgroundColor: tokens.colors.light.electricBlue,
  },
  buttonPrimaryText: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
  buttonDark: {
    backgroundColor: tokens.colors.light.charcoal,
  },
  buttonDarkText: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: tokens.colors.light.deepIndigo,
    backgroundColor: 'transparent',
  },
  buttonOutlineText: {
    ...textStyles.subheading,
    color: tokens.colors.light.deepIndigo,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tokens.colors.light.midGray,
  },
  dividerText: {
    ...textStyles.bodySmall,
    color: tokens.colors.light.midGray,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: '#D92B2B',
    textAlign: 'center',
  },
  legal: {
    ...textStyles.caption,
    color: tokens.colors.light.midGray,
    textAlign: 'center',
    marginBottom: tokens.spacing.base,
  },
});
