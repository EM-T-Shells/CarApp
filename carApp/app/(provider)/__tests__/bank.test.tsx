// bank.test.tsx — unit tests for the Bank step (Flow 4.6 / Blocker #6).
//
// Exercises the onAction orchestration that BankStep hands to VettingActionStep:
// start Connect onboarding → open the hosted session → re-check status →
// map the outcome to a vetting step result. VettingActionStep is mocked so the
// test invokes onAction directly and asserts the mapping, independent of the
// shared step UI (covered by its own tests).

import React from 'react';
import { render } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import type { VettingActionResult } from '../../../src/components/provider/VettingActionStep';
import { startConnectOnboarding, refreshConnectStatus } from '../../../src/lib/stripe/connect';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('../../../src/lib/stripe/connect', () => ({
  startConnectOnboarding: jest.fn(),
  refreshConnectStatus: jest.fn(),
}));

// Capture the onAction prop VettingActionStep is rendered with so we can call it
// directly. Render a placeholder so BankStep mounts without the real step UI.
let capturedOnAction: ((providerId: string) => Promise<VettingActionResult>) | null = null;
jest.mock('../../../src/components/provider/VettingActionStep', () => {
  const { View } = require('react-native');
  return {
    VettingActionStep: (props: {
      onAction: (providerId: string) => Promise<VettingActionResult>;
    }) => {
      capturedOnAction = props.onAction;
      return <View testID="vetting-action-step" />;
    },
  };
});

import BankStep from '../bank';

const mockOpenSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockStart = startConnectOnboarding as jest.Mock;
const mockRefresh = refreshConnectStatus as jest.Mock;

const RETURN_URL = 'carapp://provider/bank';
const ONBOARDING_URL = 'https://connect.stripe.com/setup/abc';

function mountAndGetAction(): (providerId: string) => Promise<VettingActionResult> {
  capturedOnAction = null;
  render(<BankStep />);
  if (!capturedOnAction) throw new Error('onAction was not captured');
  return capturedOnAction;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BankStep onAction', () => {
  it('opens Stripe onboarding and approves once payouts are enabled', async () => {
    mockStart.mockResolvedValue({ configured: true, url: ONBOARDING_URL });
    mockOpenSession.mockResolvedValue({ type: 'success', url: RETURN_URL });
    mockRefresh.mockResolvedValue({ state: 'approved' });

    const onAction = mountAndGetAction();
    const result = await onAction('pp-1');

    expect(mockStart).toHaveBeenCalledWith('pp-1');
    expect(mockOpenSession).toHaveBeenCalledWith(ONBOARDING_URL, RETURN_URL);
    expect(mockRefresh).toHaveBeenCalledWith('pp-1');
    expect(result).toEqual({ status: 'approved' });
  });

  it('keeps the step in progress when Stripe is still reviewing the account', async () => {
    mockStart.mockResolvedValue({ configured: true, url: ONBOARDING_URL });
    mockOpenSession.mockResolvedValue({ type: 'success', url: RETURN_URL });
    mockRefresh.mockResolvedValue({ state: 'pending' });

    const result = await mountAndGetAction()('pp-1');

    expect(result).toEqual({ status: 'submitted' });
  });

  it('leaves the step submitted when the user dismisses before finishing', async () => {
    mockStart.mockResolvedValue({ configured: true, url: ONBOARDING_URL });
    mockOpenSession.mockResolvedValue({ type: 'cancel' });

    const result = await mountAndGetAction()('pp-1');

    // Account already exists server-side; don't re-check status on dismiss.
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'submitted' });
  });

  it('surfaces an error when onboarding is not configured', async () => {
    mockStart.mockResolvedValue({ configured: false, error: 'Connect disabled' });

    const result = await mountAndGetAction()('pp-1');

    expect(mockOpenSession).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Connect disabled' });
  });

  it('falls back to a generic message when onboarding is not configured and gives no error', async () => {
    mockStart.mockResolvedValue({ configured: false });

    const result = await mountAndGetAction()('pp-1');

    expect(result).toEqual({ error: 'Bank payouts are not set up yet.' });
  });

  it('surfaces an error when the post-return status check fails', async () => {
    mockStart.mockResolvedValue({ configured: true, url: ONBOARDING_URL });
    mockOpenSession.mockResolvedValue({ type: 'success', url: RETURN_URL });
    mockRefresh.mockResolvedValue({ state: 'pending', error: 'Status check failed.' });

    const result = await mountAndGetAction()('pp-1');

    expect(result).toEqual({ error: 'Status check failed.' });
  });
});
