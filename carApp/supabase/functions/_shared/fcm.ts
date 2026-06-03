// Shared FCM sender used by every notify-* Edge Function.
//
// Uses the FCM Legacy HTTP API for simplicity — it accepts a single shared
// server key from the Firebase console (Project Settings → Cloud Messaging
// → Server key). Set it as a Supabase secret:
//
//   supabase secrets set FCM_SERVER_KEY=<value>
//
// When the legacy API is eventually retired we'll need to migrate to the
// HTTP v1 API (OAuth-based, requires the service-account JSON). The call
// site won't change — only this helper will.
//
// Each notify-* function also writes a row to the `notifications` table so
// the in-app notification center reflects the same event even when the
// device push fails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_LEGACY_URL = 'https://fcm.googleapis.com/fcm/send';

export interface PushTarget {
  fcm_token: string | null;
  fcm_token_platform?: string | null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Free-form metadata used by the app to route the tap (see push.ts). */
  data?: Record<string, string>;
}

// ─── Supabase service-role client ──────────────────────────────────────

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

// ─── FCM send ──────────────────────────────────────────────────────────

/**
 * Sends a single push notification via FCM. Returns true on a non-error
 * response. Soft-fails when FCM_SERVER_KEY is not configured so the
 * function still records the in-app notification row.
 */
export async function sendFcm(
  target: PushTarget,
  message: PushMessage,
): Promise<boolean> {
  const serverKey = Deno.env.get('FCM_SERVER_KEY');
  if (!serverKey) {
    console.warn('FCM_SERVER_KEY not set — skipping push send');
    return false;
  }
  if (!target.fcm_token) {
    return false;
  }

  const payload = {
    to: target.fcm_token,
    notification: {
      title: message.title,
      body: message.body,
      sound: 'default',
    },
    data: message.data ?? {},
    // High priority ensures iOS/Android deliver right away for time-sensitive
    // booking events.
    priority: 'high',
  };

  try {
    const res = await fetch(FCM_LEGACY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn('FCM send non-OK', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn('FCM send threw', err);
    return false;
  }
}

// ─── In-app notification row ───────────────────────────────────────────

/**
 * Records the notification in the `notifications` table so the in-app
 * inbox / banner can render it even when the device push fails (no token,
 * permissions denied, FCM outage, etc.).
 */
export async function recordNotification(
  userId: string,
  type: string,
  message: PushMessage,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = serviceClient();
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title: message.title,
    body: message.body,
    metadata: { ...metadata, ...(message.data ?? {}) },
  });
}

// ─── Shared CORS headers ───────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ─── User lookup ───────────────────────────────────────────────────────

/**
 * Loads a user's FCM token + display name.
 */
export async function getUserPushTarget(
  userId: string,
): Promise<(PushTarget & { full_name: string | null }) | null> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('users')
    .select('fcm_token, fcm_token_platform, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PushTarget & { full_name: string | null };
}

/**
 * Loads the provider profile owner's user id so we can target their device.
 */
export async function getProviderUserId(
  providerId: string,
): Promise<string | null> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('user_id')
    .eq('id', providerId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { user_id: string | null }).user_id;
}
