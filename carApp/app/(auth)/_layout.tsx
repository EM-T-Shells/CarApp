// (auth) stack layout — groups all unauthenticated screens (sign-in,
// OTP entry/verify, onboarding, pending approval) under a single
// headerless stack. The root _layout.tsx handles routing INTO this
// group; this file just configures the stack chrome.

import React from 'react';
import { Stack } from 'expo-router';
import tokens from '../../src/design/tokens';

export default function AuthLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: tokens.colors.light.offWhite,
        },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="otp-entry" />
      <Stack.Screen name="otp-verify" />
      <Stack.Screen name="pending-approval" />
    </Stack>
  );
}
