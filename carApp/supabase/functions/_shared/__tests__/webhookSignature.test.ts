// Tests the real signature-verification helper used by checkr-webhook and
// persona-webhook. Unlike the other Edge Function specs (which re-implement
// logic because the Deno index.ts files pull in remote imports), this module
// is pure Web Crypto with no remote imports, so we exercise it directly.

import {
  hmacSha256Hex,
  verifyCheckrSignature,
  verifyPersonaSignature,
} from '../webhookSignature';

// jest-expo runs on Node; older Node test envs may not expose globalThis.crypto
// (Web Crypto). Polyfill from node:crypto so crypto.subtle is available.
import { webcrypto } from 'crypto';
beforeAll(() => {
  if (typeof globalThis.crypto === 'undefined') {
    // @ts-expect-error — assigning the Node webcrypto to the global.
    globalThis.crypto = webcrypto;
  }
});

const SECRET = 'whsec_test_secret';
const BODY = JSON.stringify({ data: { object: { status: 'clear', provider_id: 'p1' } } });

describe('hmacSha256Hex', () => {
  it('is deterministic and 64 hex chars (SHA-256)', async () => {
    const a = await hmacSha256Hex(SECRET, BODY);
    const b = await hmacSha256Hex(SECRET, BODY);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the secret or message changes', async () => {
    const base = await hmacSha256Hex(SECRET, BODY);
    expect(await hmacSha256Hex('other_secret', BODY)).not.toBe(base);
    expect(await hmacSha256Hex(SECRET, BODY + ' ')).not.toBe(base);
  });
});

describe('verifyCheckrSignature', () => {
  it('accepts a correct hex HMAC of the raw body', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyCheckrSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('accepts an upper-cased / whitespace-padded header', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyCheckrSignature(BODY, `  ${sig.toUpperCase()}  `, SECRET)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyCheckrSignature(BODY + 'x', sig, SECRET)).toBe(false);
  });

  it('rejects a wrong signature, and a missing header or secret', async () => {
    expect(await verifyCheckrSignature(BODY, 'deadbeef', SECRET)).toBe(false);
    expect(await verifyCheckrSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifyCheckrSignature(BODY, await hmacSha256Hex(SECRET, BODY), '')).toBe(false);
  });
});

describe('verifyPersonaSignature', () => {
  async function personaHeader(ts: string, body: string, secret = SECRET): Promise<string> {
    const v1 = await hmacSha256Hex(secret, `${ts}.${body}`);
    return `t=${ts},v1=${v1}`;
  }

  it('accepts a correct t=/v1= header signed over "<t>.<body>"', async () => {
    const header = await personaHeader('1700000000', BODY);
    expect(await verifyPersonaSignature(BODY, header, SECRET)).toBe(true);
  });

  it('accepts when any one of multiple v1 values matches (secret rotation)', async () => {
    const good = await hmacSha256Hex(SECRET, `1700000000.${BODY}`);
    const header = `t=1700000000,v1=ffffffff,v1=${good}`;
    expect(await verifyPersonaSignature(BODY, header, SECRET)).toBe(true);
  });

  it('rejects when the timestamp differs from the signed one', async () => {
    const header = await personaHeader('1700000000', BODY);
    // Swap the t= but keep the old v1 → signed message no longer matches.
    const tampered = header.replace('t=1700000000', 't=1700000001');
    expect(await verifyPersonaSignature(BODY, tampered, SECRET)).toBe(false);
  });

  it('rejects a tampered body, wrong secret, and malformed headers', async () => {
    const header = await personaHeader('1700000000', BODY);
    expect(await verifyPersonaSignature(BODY + 'x', header, SECRET)).toBe(false);
    expect(await verifyPersonaSignature(BODY, header, 'wrong_secret')).toBe(false);
    expect(await verifyPersonaSignature(BODY, 'v1=abc', SECRET)).toBe(false); // no t=
    expect(await verifyPersonaSignature(BODY, 't=1700000000', SECRET)).toBe(false); // no v1=
    expect(await verifyPersonaSignature(BODY, null, SECRET)).toBe(false);
  });
});
