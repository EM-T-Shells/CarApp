// More stack layout — keeps account, admin, lug, provider, and settings
// sub-screens nested under the single More tab instead of leaking into the
// bottom tab bar as separate tabs. index renders its own header so headerShown
// is false there.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function MoreLayout(): React.ReactElement {
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
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
      <Stack.Screen name="lug" options={{ title: 'Lug' }} />
      <Stack.Screen name="provider" options={{ title: 'Provider' }} />
      <Stack.Screen name="provider-manage" options={{ title: 'Services & Availability' }} />
      <Stack.Screen name="provider-earnings" options={{ title: 'Earnings' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
