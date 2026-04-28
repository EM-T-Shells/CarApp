// Bookings stack layout — manages navigation between the upcoming bookings
// list, past bookings history, booking detail, and live tracking screens
// within the Bookings tab. index renders its own header so headerShown is
// false there; all child screens get a styled Stack header.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function BookingsLayout(): React.ReactElement {
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
      <Stack.Screen name="past" options={{ title: 'Past Bookings' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen
        name="tracking/[bookingId]"
        options={{ title: 'Live Tracking', headerShown: false }}
      />
    </Stack>
  );
}
