// Provider Jobs stack layout — the job queue (index), past jobs history, and
// the active-job detail screen. index renders its own header so headerShown is
// false there; child screens get a styled Stack header. Mirrors the customer
// bookings/_layout.tsx conventions.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function ProviderJobsLayout(): React.ReactElement {
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
      <Stack.Screen name="past" options={{ title: 'Past Jobs' }} />
      <Stack.Screen name="[bookingId]" options={{ title: 'Job' }} />
    </Stack>
  );
}
