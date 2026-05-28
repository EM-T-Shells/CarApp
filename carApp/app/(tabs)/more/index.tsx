// More tab — empty shell. Will be fleshed out in Phase 15.
//
// Hosts the user-facing "Sign out" button until the Account sub-screen
// is built. Confirmation alert prevents accidental sign-outs.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { Text } from '../../../src/components/ui/Text';
import { borderRadius, colors, spacing } from '../../../src/design/tokens';
import { textStyles } from '../../../src/design/typography';
import { signOut } from '../../../src/lib/supabase/auth';

export default function MoreScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  const [signingOut, setSigningOut] = useState(false);

  function confirmSignOut(): void {
    if (signingOut) return;
    Alert.alert(
      'Sign out?',
      'You will need to sign in again to access your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: handleSignOut },
      ],
    );
  }

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
    // Root auth gate detects the cleared session and routes back to (auth)/.
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      <Text variant="heading" color="charcoal">
        More
      </Text>

      <Pressable
        onPress={confirmSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        testID="more-sign-out"
        style={({ pressed }) => [
          styles.signOutButton,
          { borderColor: palette.deepIndigo },
          pressed && !signingOut && styles.signOutButtonPressed,
          signingOut && styles.signOutButtonDisabled,
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color={palette.deepIndigo} />
        ) : (
          <Text style={[styles.signOutButtonText, { color: palette.deepIndigo }]}>
            Sign out
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
    gap: spacing.xl,
  },
  signOutButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutButtonDisabled: {
    opacity: 0.5,
  },
  signOutButtonText: {
    ...textStyles.label,
  },
});
