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
import { getProviderByUserId } from '../src/lib/supabase/queries';
import { registerPushNotifications } from '../src/lib/notifications/push';
import { useAuthStore, type ProviderVerificationStatus } from '../src/state/auth';
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
  const role = useAuthStore((s) => s.role);
  const providerVerification = useAuthStore((s) => s.providerVerification);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isHydrating) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    // The (provider) group hosts the full-screen vetting flow (opt-in →
    // identity/background/insurance/credentials/bank/profile). It lives
    // outside the tab bar like (auth), so authenticated users must be
    // allowed to stay in it rather than being bounced back to (tabs).
    const inProviderGroup = segments[0] === '(provider)';
    const seg1 = (segments as readonly string[])[1];
    const inOnboarding = inAuthGroup && seg1 === 'onboarding';
    const onPendingApproval = inAuthGroup && seg1 === 'pending-approval';

    if (!session) {
      // Signed out — force into (auth).
      if (!inAuthGroup) {
        router.replace('/(auth)/');
      }
      return;
    }

    // Signed in but no `users` row yet — new user, push them into
    // the multi-step onboarding flow. Don't bounce them if they are
    // already inside the onboarding sub-stack so the inner navigation
    // (profile → role → vehicle → review) can run uninterrupted.
    if (!user) {
      if (!inOnboarding) {
        router.replace('/(auth)/onboarding/role');
      }
      return;
    }

    // Provider-only accounts must finish vetting before they reach the app.
    // (Hybrid 'both' users are also customers, so they are never blocked — they
    // can use the tabs and complete vetting from More → Provider at their pace.)
    if (role === 'provider' && providerVerification !== 'approved') {
      // Wait until the verification status is actually known so we don't flash
      // the tabs before redirecting.
      if (providerVerification === null) return;
      // Let them work through the vetting flow or sit on the pending screen.
      if (inProviderGroup || onPendingApproval) return;
      router.replace('/(auth)/pending-approval');
      return;
    }

    // Signed in + hydrated user row — route into (tabs), unless the user is
    // intentionally inside the (provider) vetting flow.
    if (!inTabsGroup && !inProviderGroup) {
      router.replace('/(tabs)/search');
    }
  }, [isHydrating, session, user, role, providerVerification, segments, router]);
}

// ── Root Layout ────────────────────────────────────────────────────────

export default function RootLayout(): React.ReactElement {
  const setSession = useAuthStore((s) => s.setSession);
  const setProviderVerification = useAuthStore((s) => s.setProviderVerification);
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
      if (!isMounted) return;
      setSession(session, userRow);

      // Session resume — re-register the device's FCM token so the
      // notify-* Edge Functions can target this user. Idempotent and
      // fire-and-forget; failures are swallowed inside the module and must
      // not block hydration. Skipped until the user has finished onboarding
      // (no users row yet → nothing to attach the token to).
      if (userRow) {
        void registerPushNotifications({ userId: userRow.id });
      }

      // Resolve provider verification so the gate can hold provider-only
      // accounts on pending-approval until they're approved.
      if (userRow && (userRow.role === 'provider' || userRow.role === 'both')) {
        const { data } = await getProviderByUserId(userRow.id);
        if (isMounted) {
          setProviderVerification(
            (data?.verification_status as ProviderVerificationStatus | null) ??
              'pending',
          );
        }
      } else {
        setProviderVerification(null);
      }
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
  }, [setSession, setProviderVerification, clear, finishHydration]);

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
