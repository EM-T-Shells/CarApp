// vetting-stubs.test.ts — guards the external-integration stubs (persona,
// checkr, stripe connect) until they're wired up: each should report itself as
// not yet configured so the vetting steps fall back gracefully.

import { startPersonaInquiry } from '../persona';
import { startBackgroundCheck } from '../checkr';
import { startConnectOnboarding } from '../stripe/connect';

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

  it('Stripe Connect onboarding reports not configured', async () => {
    const res = await startConnectOnboarding('pp-1');
    expect(res.configured).toBe(false);
    expect(res.url).toBeUndefined();
  });
});
