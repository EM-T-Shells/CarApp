// Provider More stack layout — the provider hub (index) plus the Services &
// Availability editor (manage). index renders its own header so headerShown is
// false there; manage gets a styled Stack header. Mirrors the customer
// more/_layout.tsx conventions.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function ProviderMoreLayout(): React.ReactElement {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="manage" options={{ title: 'Services & Availability' }} />
    </Stack>
  );
}
