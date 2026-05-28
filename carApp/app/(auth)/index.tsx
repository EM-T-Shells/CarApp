// Splash / welcome screen — the landing route inside the (auth) group.
// Shows brand, tagline, and a single CTA that pushes the user into the
// sign-in screen. The auth gate in app/_layout.tsx routes unauthenticated
// users here by default.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import tokens from '../../src/design/tokens';
import { textStyles } from '../../src/design/typography';
import { Text } from '../../src/components/ui/Text';

export default function SplashScreen(): React.ReactElement {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <Text style={styles.logoMark}>CarApp</Text>
          <Text style={styles.tagline}>
            Premium car care, on your schedule, at your location.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
            ]}
            onPress={() => router.push('/(auth)/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            testID="splash-cta"
          >
            <Text style={styles.ctaLabel}>Get Started</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.light.deepIndigo,
  },
  container: {
    flex: 1,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
    justifyContent: 'space-between',
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.lg,
  },
  logoMark: {
    ...textStyles.displayLarge,
    color: tokens.colors.light.offWhite,
    textAlign: 'center',
  },
  tagline: {
    ...textStyles.bodyLarge,
    color: tokens.colors.light.offWhite,
    textAlign: 'center',
    opacity: 0.85,
    paddingHorizontal: tokens.spacing.lg,
  },
  actions: {
    gap: tokens.spacing.md,
  },
  cta: {
    minHeight: 52,
    borderRadius: tokens.borderRadius.button,
    backgroundColor: tokens.colors.light.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaLabel: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
  },
});
