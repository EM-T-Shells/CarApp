// bank.test.tsx — unit tests for the Bank step (Flow 4.6 / Blocker #6).
//
// MVP prototype: the Bank step no longer runs Stripe Connect onboarding. The
// onAction BankStep hands to VettingActionStep just marks bank_status approved
// via updateProviderVetting. These tests exercise that mapping (VettingActionStep
// is mocked so onAction can be invoked directly, independent of the shared UI).

import React from 'react';
import { render } from '@testing-library/react-native';
import type { VettingActionResult } from '../../../src/components/provider/VettingActionStep';
import { updateProviderVetting } from '../../../src/lib/supabase/mutations';

jest.mock('../../../src/lib/supabase/mutations', () => ({
  updateProviderVetting: jest.fn(),
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

const mockUpdate = updateProviderVetting as jest.Mock;

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
  it('marks the bank step approved', async () => {
    mockUpdate.mockResolvedValue({ data: true, error: null });

    const onAction = mountAndGetAction();
    const result = await onAction('pp-1');

    expect(mockUpdate).toHaveBeenCalledWith('pp-1', { bank_status: 'approved' });
    expect(result).toEqual({ status: 'approved' });
  });

  it('surfaces an error when the vetting update fails', async () => {
    mockUpdate.mockResolvedValue({ data: null, error: new Error('Update failed') });

    const result = await mountAndGetAction()('pp-1');

    expect(result).toEqual({ error: 'Update failed' });
  });
});
