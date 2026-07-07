// Shared HMAC-SHA256 webhook signature verification for Edge Functions.
//
// Added to close the TODO(🔒) gap in checkr-webhook / persona-webhook: both
// vendors sign their payloads with an HMAC of the raw request body, but until
// now the functions trusted the body without verifying the header. Any caller
// who knew the URL could forge a vetting-status update.
//
// This module deliberately uses ONLY Web Crypto (globalThis.crypto.subtle),
// which is present in both the Deno edge runtime and Node 18+/Jest — so the
// same code the Edge Functions run is exercised directly by the unit tests
// (no mirrored copy of the crypto logic).
//
// Two header formats are supported:
//   Checkr  — X-Checkr-Signature: <hex(hmac(body))>
//   Persona — Persona-Signature: t=<unix>,v1=<hex(hmac("<t>.<body>"))>
//             (a comma/space separated list; the first valid v1 that matches
//              wins, mirroring how Persona rotates signing secrets.)

const encoder = new TextEncoder();

/** Constant-time comparison of two equal-length-ish strings. */
function timingSafeEqual(a: string, b: string): boolean {
  // Length is not secret for a hex digest, but bail early on mismatch after a
  // fixed-cost compare to avoid leaking via early return on the common path.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Lowercase hex encoding of an ArrayBuffer. */
function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Compute the hex HMAC-SHA256 of `message` under `secret`. */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(sig);
}

/**
 * Verify a Checkr-style signature: the header is the hex HMAC-SHA256 of the
 * raw body. Returns false for a missing/empty header or secret.
 */
export async function verifyCheckrSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !header) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, header.trim().toLowerCase());
}

/**
 * Verify a Persona-style signature header of the form
 * `t=<unix>,v1=<hex>` (possibly with multiple `v1=` values). The signed
 * message is `<t>.<rawBody>`. Returns false if no `v1` matches.
 */
export async function verifyPersonaSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !header) return false;

  // Parse `t=...,v1=...,v1=...` into its parts.
  const parts = header.split(/[,\s]+/).filter(Boolean);
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't' && v) timestamp = v;
    else if (k === 'v1' && v) signatures.push(v.toLowerCase());
  }
  if (!timestamp || signatures.length === 0) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((sig) => timingSafeEqual(expected, sig));
}
