// Shared FCM sender used by every notify-* Edge Function.
//
// Uses the FCM HTTP v1 API (the legacy server-key API was retired by Google
// in 2024). Authentication is via a Firebase service-account key, which we
// exchange for a short-lived OAuth access token using the standard JWT-bearer
// flow (signed with the Web Crypto API — no external libraries).
//
// Set the secret to the FULL service-account JSON downloaded from the Firebase
// console (Project Settings → Service accounts → Generate new private key):
//
//   supabase secrets set FCM_SERVICE_ACCOUNT='<paste the whole JSON>'
//
// Each notify-* function also writes a row to the `notifications` table so
// the in-app notification center reflects the same event even when the
// device push fails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_V1_BASE = 'https://fcm.googleapis.com/v1/projects';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

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

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// ─── Supabase service-role client ──────────────────────────────────────

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

// ─── OAuth token minting (service account → access token) ──────────────

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Module-scoped cache so a single invocation that sends multiple pushes (e.g.
// booking-confirmed → customer + provider) mints the token only once.
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(claims),
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { token: data.access_token as string, exp: now + 3500 };
  return cachedToken.token;
}

// ─── FCM send ──────────────────────────────────────────────────────────

/**
 * Sends a single push notification via the FCM HTTP v1 API. Returns true on a
 * non-error response. Soft-fails when FCM_SERVICE_ACCOUNT is not configured so
 * the function still records the in-app notification row.
 */
export async function sendFcm(
  target: PushTarget,
  message: PushMessage,
): Promise<boolean> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) {
    console.warn('FCM_SERVICE_ACCOUNT not set — skipping push send');
    return false;
  }
  if (!target.fcm_token) {
    return false;
  }

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw) as ServiceAccount;
  } catch {
    console.warn('FCM_SERVICE_ACCOUNT is not valid JSON — skipping push send');
    return false;
  }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    console.warn('FCM_SERVICE_ACCOUNT missing required fields');
    return false;
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (err) {
    console.warn('FCM access-token mint failed', err);
    return false;
  }

  const payload = {
    message: {
      token: target.fcm_token,
      notification: {
        title: message.title,
        body: message.body,
      },
      // v1 requires all data values to be strings (they already are here).
      data: message.data ?? {},
      // High priority ensures iOS/Android deliver right away for time-sensitive
      // booking events.
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    },
  };

  try {
    const res = await fetch(
      `${FCM_V1_BASE}/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      console.warn('FCM v1 send non-OK', res.status, await res.text());
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
