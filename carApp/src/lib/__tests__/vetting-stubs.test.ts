// vetting-stubs.test.ts — guards the external-integration stubs (persona,
// checkr) until they're wired up: each should report itself as not yet
// configured so the vetting steps fall back gracefully.
//
// Note: Stripe Connect onboarding is no longer a stub (Flow 4.6 is wired up) —
// its behavior is covered in src/lib/stripe/__tests__/connect.test.ts.

import { startPersonaInquiry } from '../persona';
import { startBackgroundCheck } from '../checkr';

describe('vetting integration stubs', () => {
  it('Persona inquiry reports not configured', async () => {
    const res = await startPersonaInquiry('user-1');
    expect(res.configured).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('Checkr background check reports not configured', async () => {
    const res = await startBackgroundCheck('pp-1');
    expect(res.configured).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
