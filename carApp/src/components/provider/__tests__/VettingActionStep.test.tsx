// VettingActionStep.test.tsx — unit tests for the action-based vetting step
// (used by the Background and Bank screens).

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

const mockGetProvider = jest.fn();
const mockGetVetting = jest.fn();
jest.mock('../../../lib/supabase/queries', () => ({
  getProviderByUserId: (...a: unknown[]) => mockGetProvider(...a),
  getProviderVetting: (...a: unknown[]) => mockGetVetting(...a),
}));

const mockAuthUser = { id: 'user-1' };
jest.mock('../../../state/auth', () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: mockAuthUser }),
}));

jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) => (
      <TouchableOpacity onPress={onPress} testID={testID}><Text>{label}</Text></TouchableOpacity>
    ),
  };
});

import { VettingActionStep } from '../VettingActionStep';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProvider.mockResolvedValue({ data: { id: 'pp-1' }, error: null });
  mockGetVetting.mockResolvedValue({ data: { background_status: 'pending' }, error: null });
});

describe('VettingActionStep', () => {
  it('runs the action and reflects the returned status', async () => {
    const onAction = jest.fn().mockResolvedValue({ status: 'submitted' });
    render(
      <VettingActionStep
        statusField="background_status"
        title="Background check"
        description="Authorize it."
        actionLabel="Authorize background check"
        onAction={onAction}
      />,
    );
    await screen.findByTestId('vetting-action');
    await act(async () => {
      fireEvent.press(screen.getByTestId('vetting-action'));
    });
    expect(onAction).toHaveBeenCalledWith('pp-1', 'user-1');
    expect(await screen.findByText('Under review')).toBeTruthy();
  });

  it('surfaces an alert and keeps status when the action errors', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onAction = jest.fn().mockResolvedValue({ error: 'Not set up yet.' });
    render(
      <VettingActionStep
        statusField="bank_status"
        title="Bank account"
        description="Connect it."
        actionLabel="Connect with Stripe"
        onAction={onAction}
      />,
    );
    await screen.findByTestId('vetting-action');
    await act(async () => {
      fireEvent.press(screen.getByTestId('vetting-action'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Not available yet', 'Not set up yet.');
    expect(screen.getByText('Not started')).toBeTruthy();
    alertSpy.mockRestore();
  });
});
