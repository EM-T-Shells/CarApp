// Services stack layout — the catalog index renders its own header, so it
// stays headerless; the per-service provider list gets a styled Stack header
// (with a back affordance) whose title is set to the service name.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function ServicesLayout(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

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
      <Stack.Screen name="[catalogId]" options={{ title: 'Providers' }} />
    </Stack>
  );
}
