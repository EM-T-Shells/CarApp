// Root layout — wraps the entire app and owns the Supabase auth
// lifecycle. It subscribes to onAuthStateChange, hydrates
// useAuthStore with the session and the matching `users` row, and
// routes the user between (auth) and (tabs) based on the result.
//
// This file is the single source of truth for "am I signed in?" —
// no other screen should call supabase.auth.getSession() directly.

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../src/lib/supabase/client';
import { useAuthStore } from '../src/state/auth';
import type { User } from '../src/types/models';
import tokens from '../src/design/tokens';

const STRIPE_PUBLISHABLE_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
  '';

// ── User Row Hydration ─────────────────────────────────────────────────

async function fetchUserRow(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Do not throw — surface via null so the gate falls back to
    // onboarding. Sentry breadcrumb would go here in production.
    return null;
  }
  return data;
}

// ── Navigation Gate ────────────────────────────────────────────────────

/**
 * Decides which route group the user should be in based on the
 * current auth state and navigates them there. Called whenever
 * either the auth state or the segments change.
 */
function useProtectedRoute(): void {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isHydrating) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!session) {
      // Signed out — force into (auth).
      if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    // Signed in but no `users` row yet — new user, stay in (auth)
    // so the onboarding flow can run. Each onboarding screen lives
    // under (auth) until the users row is inserted.
    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    // Signed in + hydrated user row — route into (tabs).
    if (!inTabsGroup) {
      router.replace('/(tabs)');
    }
  }, [isHydrating, session, user, segments, router]);
}

// ── Root Layout ────────────────────────────────────────────────────────

export default function RootLayout(): React.ReactElement {
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const finishHydration = useAuthStore((s) => s.finishHydration);
  const isHydrating = useAuthStore((s) => s.isHydrating);

  // Hydrate on mount + subscribe to changes.
  useEffect(() => {
    let isMounted = true;

    async function hydrate(session: Session | null): Promise<void> {
      if (!session) {
        if (isMounted) clear();
        return;
      }
      const userRow = await fetchUserRow(session.user.id);
      if (isMounted) setSession(session, userRow);
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        void hydrate(data.session).finally(() => {
          if (isMounted) finishHydration();
        });
      })
      .catch(() => {
        if (isMounted) finishHydration();
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void hydrate(session);
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [setSession, clear, finishHydration]);

  useProtectedRoute();

  if (isHydrating) {
    return (
      <View style={styles.splash} testID="auth-hydrating-splash">
        <ActivityIndicator
          size="large"
          color={tokens.colors.light.electricBlue}
        />
      </View>
    );
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <Slot />
    </StripeProvider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.light.offWhite,
  },
});
