// More tab — empty shell. Will be fleshed out in Phase 15.
//
// Includes a __DEV__-only "Sign out" affordance so developers can
// reset the local session during UAT without uninstalling the app or
// wiping the simulator. The button is stripped from production builds.

import React, { useState } from 'react';
import {
  ActivityIndicator,
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

  async function handleSignOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    // Root auth gate detects the cleared session and routes back to (auth)/.
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      <Text variant="heading" color="charcoal">
        More
      </Text>

      {__DEV__ ? (
        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out (dev)"
          testID="more-dev-sign-out"
          style={({ pressed }) => [
            styles.devButton,
            { borderColor: palette.deepIndigo },
            pressed && !signingOut && styles.devButtonPressed,
            signingOut && styles.devButtonDisabled,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color={palette.deepIndigo} />
          ) : (
            <Text style={[styles.devButtonText, { color: palette.deepIndigo }]}>
              Sign out (dev)
            </Text>
          )}
        </Pressable>
      ) : null}
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
  devButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devButtonPressed: {
    opacity: 0.7,
  },
  devButtonDisabled: {
    opacity: 0.5,
  },
  devButtonText: {
    ...textStyles.label,
  },
});
