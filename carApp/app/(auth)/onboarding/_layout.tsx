// Onboarding stack layout — wraps the 4-step customer signup flow
// (profile → role → vehicle → review) that runs after a successful
// OTP or OAuth sign-in when no users row exists yet.
//
// The root auth gate in app/_layout.tsx routes brand-new sessions
// into /(auth)/onboarding/profile; from there each screen uses the
// shared useSignUpDraftStore to accumulate state and pushes forward
// with router.push.

import React from 'react';
import { Stack } from 'expo-router';
import tokens from '../../../src/design/tokens';

export default function OnboardingLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: {
          backgroundColor: tokens.colors.light.offWhite,
        },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="profile" />
      <Stack.Screen name="role" />
      <Stack.Screen name="vehicle" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
