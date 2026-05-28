// Inbox stack layout — keeps the thread detail screen nested under the single
// Inbox tab instead of leaking into the bottom tab bar as a separate tab.
// index renders its own header so headerShown is false there.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function InboxLayout(): React.ReactElement {
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
      <Stack.Screen name="[threadId]" options={{ title: '' }} />
    </Stack>
  );
}
