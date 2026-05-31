// vetting.test.tsx — unit tests for the vetting hub (Flow 4.1 scaffold).

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockGetProviderByUserId = jest.fn();
const mockGetProviderVetting = jest.fn();
jest.mock('../../../src/lib/supabase/queries', () => ({
  getProviderByUserId: (...a: unknown[]) => mockGetProviderByUserId(...a),
  getProviderVetting: (...a: unknown[]) => mockGetProviderVetting(...a),
}));

const mockAuthUser = { id: 'user-1' };
jest.mock('../../../src/state/auth', () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: mockAuthUser }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { CheckCircle2: icon('CheckCircle2'), ChevronRight: icon('ChevronRight') };
});
jest.mock('../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../src/components/ui/Card', () => {
  const { TouchableOpacity } = require('react-native');
  return {
    Card: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>
    ),
  };
});
jest.mock('../../../src/components/provider/VettingStepIndicator', () => {
  const { View } = require('react-native');
  return { VettingStepIndicator: () => <View testID="step-indicator" /> };
});

import VettingHubScreen from '../vetting';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProviderByUserId.mockResolvedValue({
    data: { id: 'pp-1', verification_status: 'pending' },
    error: null,
  });
  mockGetProviderVetting.mockResolvedValue({
    data: {
      provider_id: 'pp-1',
      identity_status: 'approved',
      background_status: 'submitted',
      insurance_status: 'pending',
      credentials_status: 'pending',
      bank_status: 'pending',
      profile_completeness: 90,
    },
    error: null,
  });
});

describe('VettingHubScreen', () => {
  it('renders all six step rows with statuses', async () => {
    render(<VettingHubScreen />);
    expect(await screen.findByText('Profile')).toBeTruthy();
    expect(screen.getByText('Identity')).toBeTruthy();
    expect(screen.getByText('Bank')).toBeTruthy();
    // identity approved, background under review
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Under review')).toBeTruthy();
  });

  it('routes to a step screen when its row is tapped', async () => {
    render(<VettingHubScreen />);
    fireEvent.press(await screen.findByText('Identity'));
    expect(mockPush).toHaveBeenCalledWith('/(provider)/identity');
  });

  it('shows the approved banner when verification_status is approved', async () => {
    mockGetProviderByUserId.mockResolvedValue({
      data: { id: 'pp-1', verification_status: 'approved' },
      error: null,
    });
    render(<VettingHubScreen />);
    expect(
      await screen.findByText(/You're approved/),
    ).toBeTruthy();
  });

  it('shows an error when the provider profile is missing', async () => {
    mockGetProviderByUserId.mockResolvedValue({ data: null, error: new Error('nope') });
    render(<VettingHubScreen />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });
});
