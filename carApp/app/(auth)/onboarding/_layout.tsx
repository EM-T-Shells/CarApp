// Onboarding stack layout — wraps the customer signup flow
// (role → profile → vehicle) that runs after a successful OTP or OAuth
// sign-in when no users row exists yet. Provider-only signups branch
// from the profile step to the terminal `review` screen.
//
// The root auth gate in app/_layout.tsx routes brand-new sessions
// into /(auth)/onboarding/role; from there each screen uses the
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
      <Stack.Screen name="role" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="vehicle" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
