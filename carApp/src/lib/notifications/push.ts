// Push notifications client — Firebase Cloud Messaging (FCM) wrapper.
// Handles permission request, token registration, refresh handling, and
// foreground/background message routing. The server-side fan-out lives in
// the supabase/functions/notify-* Edge Functions, which look up
// users.fcm_token by recipient and POST to FCM.
//
// Deep-link routing maps the `metadata.route` field on incoming FCM
// payloads to the in-app Expo Router path so a tap on a push opens the
// right screen (per the CLAUDE.md notification → route map).
//
// SAFETY: FCM init via the native Firebase plugins runs at app launch from
// app.json (`@react-native-firebase/app`). This module only orchestrates
// runtime calls (`requestPermission`, `getToken`, etc.) and never touches
// native config.

import { Platform } from 'react-native';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import type { Router } from 'expo-router';
import { updateUserPushToken } from '../supabase/mutations';

// ─── Types ─────────────────────────────────────────────────────────────

export type PushPlatform = 'ios' | 'android';

export interface RegisterPushOptions {
  /** Currently authenticated user id. The token is saved under this row. */
  userId: string;
  /**
   * Called when the user denies notification permission. The caller can
   * surface an inline upsell (Account / Settings) explaining why pushes are
   * useful for booking updates.
   */
  onPermissionDenied?: () => void;
}

export interface PushDeepLinkPayload {
  /** Optional route override sent by the server (e.g. `/bookings/<id>`). */
  route?: string;
  /** Server-controlled type used to derive a default route if `route` is missing. */
  type?: string;
  /** IDs referenced by the notification — used to fill route parameters. */
  bookingId?: string;
  threadId?: string;
}

// ─── Permission + token registration ───────────────────────────────────

/**
 * Requests notification permission (iOS prompt; on Android 13+ this also
 * surfaces the runtime POST_NOTIFICATIONS prompt). Returns true when the
 * user authorized notifications.
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const status = await messaging().requestPermission();
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

/**
 * Returns the current FCM token for this device, or null when permission
 * has not been granted or the token can't be retrieved.
 */
export async function getDevicePushToken(): Promise<string | null> {
  try {
    const token = await messaging().getToken();
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Persists the device's FCM token to the user's row so server-side
 * Edge Functions can target it. Safe to call multiple times — it overwrites
 * the prior token. Returns true on success.
 */
export async function persistPushToken(
  userId: string,
  token: string,
): Promise<boolean> {
  const platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await updateUserPushToken(userId, {
    fcm_token: token,
    fcm_token_platform: platform,
    fcm_token_updated_at: new Date().toISOString(),
  });
  return !error;
}

/**
 * Convenience wrapper: requests permission, gets the token, and saves it to
 * the user's row. Returns the token on success or null on failure. The
 * caller is responsible for calling this once after sign-in.
 */
export async function registerPushNotifications(
  options: RegisterPushOptions,
): Promise<string | null> {
  const granted = await requestPushPermission();
  if (!granted) {
    options.onPermissionDenied?.();
    return null;
  }

  const token = await getDevicePushToken();
  if (!token) return null;

  await persistPushToken(options.userId, token);
  return token;
}

/**
 * Clears the stored FCM token on sign-out so the next sign-in re-registers
 * fresh. Call from the sign-out flow before clearing the auth session.
 */
export async function unregisterPushNotifications(
  userId: string,
): Promise<void> {
  await updateUserPushToken(userId, {
    fcm_token: null,
    fcm_token_platform: null,
    fcm_token_updated_at: new Date().toISOString(),
  });
}

// ─── Token refresh listener ────────────────────────────────────────────

/**
 * Subscribes to FCM token refreshes (happens occasionally on iOS/Android)
 * and updates the user's row. Call from the root layout effect; the
 * returned unsubscribe function should fire on layout unmount.
 */
export function subscribeToTokenRefresh(userId: string): () => void {
  return messaging().onTokenRefresh((token) => {
    if (token && token.length > 0) {
      void persistPushToken(userId, token);
    }
  });
}

// ─── Foreground + background message listeners ────────────────────────

/**
 * Subscribes to foreground messages. Returns the unsubscribe function.
 * The caller decides how to surface foreground messages (toast, in-app
 * banner, silent update of cached state). We do NOT auto-show OS-level
 * notifications in the foreground because RN Firebase suppresses them.
 */
export function subscribeToForegroundMessages(
  handler: (msg: FirebaseMessagingTypes.RemoteMessage) => void,
): () => void {
  return messaging().onMessage(handler);
}

/**
 * Wires the background message handler. Must be called at module-init
 * time (outside any React component) — see app.json instructions for
 * `@react-native-firebase/messaging`. We keep it minimal here; the
 * server-side payload format is the source of truth.
 */
export function setBackgroundMessageHandler(
  handler: (msg: FirebaseMessagingTypes.RemoteMessage) => Promise<void> | void,
): void {
  messaging().setBackgroundMessageHandler(async (msg) => {
    await Promise.resolve(handler(msg));
  });
}

// ─── Deep-link routing ────────────────────────────────────────────────

/**
 * Maps an incoming push payload to an in-app route per the CLAUDE.md
 * notification → route table:
 *   booking confirmed    → /bookings/[id]
 *   provider en route    → /bookings/tracking/[bookingId]
 *   rate now             → /bookings/[id]
 *   kudos received       → /more/provider
 *   new message          → /inbox/[threadId]
 *
 * Returns the resolved route or null when no route can be derived.
 */
export function resolvePushRoute(
  payload: PushDeepLinkPayload,
): string | null {
  if (payload.route) return payload.route;

  switch (payload.type) {
    case 'booking_confirmed':
    case 'booking_requested':
    case 'booking_declined':
    case 'rate_now':
    case 'job_complete':
      return payload.bookingId ? `/bookings/${payload.bookingId}` : null;
    case 'provider_enroute':
      return payload.bookingId
        ? `/bookings/tracking/${payload.bookingId}`
        : null;
    case 'kudos_received':
      return '/more/provider';
    case 'new_message':
      return payload.threadId ? `/inbox/${payload.threadId}` : null;
    default:
      return null;
  }
}

/**
 * Handles the "user tapped a push notification" case. Pass the FCM message
 * and an Expo Router instance; this routes to the deep-linked screen if a
 * mapping exists. Returns true when navigation actually occurred.
 */
export function handleNotificationTap(
  msg: FirebaseMessagingTypes.RemoteMessage | null | undefined,
  router: Pick<Router, 'push'>,
): boolean {
  if (!msg?.data) return false;
  const payload: PushDeepLinkPayload = {
    route: msg.data.route as string | undefined,
    type: msg.data.type as string | undefined,
    bookingId: msg.data.bookingId as string | undefined,
    threadId: msg.data.threadId as string | undefined,
  };
  const route = resolvePushRoute(payload);
  if (!route) return false;
  router.push(route as never);
  return true;
}

/**
 * Subscribes to notification taps both for app-already-open and
 * app-was-cold-launched scenarios. Returns the unsubscribe function for
 * the open-app case; the initial cold-launch tap fires once and resolves
 * synchronously inside the effect.
 */
export function subscribeToNotificationTaps(
  router: Pick<Router, 'push'>,
): () => void {
  // Background → open
  const unsubOpened = messaging().onNotificationOpenedApp((msg) => {
    handleNotificationTap(msg, router);
  });

  // Cold-launch (quit → open via tap)
  void messaging()
    .getInitialNotification()
    .then((msg) => {
      handleNotificationTap(msg, router);
    });

  return unsubOpened;
}
