// Search stack layout — manages navigation between the search home,
// results list, provider profile, and booking screens within the
// Search tab. Uses headerShown: false on the home screen since it
// renders its own header; other screens get a styled Stack header.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

export default function SearchLayout(): React.ReactElement {
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
      <Stack.Screen name="results" options={{ title: 'Search Results' }} />
      <Stack.Screen name="provider/[id]" options={{ title: '' }} />
      <Stack.Screen name="book/[providerId]" options={{ title: 'Book' }} />
    </Stack>
  );
}
