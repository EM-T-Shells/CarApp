// (provider) group layout — the full-screen provider vetting flow, kept
// outside the bottom tab bar (like the (auth) group). Reached from
// More → Become a Provider once a provider_profiles row exists. The root
// auth gate (app/_layout.tsx) allows authenticated users to stay in this
// group.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../src/design/tokens';

export default function ProviderLayout(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.offWhite },
        headerTintColor: palette.charcoal,
        headerTitleStyle: { fontFamily: 'SpaceGrotesk', fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="vetting" options={{ title: 'Your application' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile & services' }} />
      <Stack.Screen name="identity" options={{ title: 'Identity' }} />
      <Stack.Screen name="background" options={{ title: 'Background check' }} />
      <Stack.Screen name="insurance" options={{ title: 'Insurance' }} />
      <Stack.Screen name="credentials" options={{ title: 'Credentials' }} />
      <Stack.Screen name="bank" options={{ title: 'Bank account' }} />
    </Stack>
  );
}
