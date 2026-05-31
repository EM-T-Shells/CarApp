// provider.test.tsx — unit tests for the Provider opt-in / status screen (4.1).

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockGetTypes = jest.fn();
const mockGetProviderByUserId = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getProviderTypes: (...a: unknown[]) => mockGetTypes(...a),
  getProviderByUserId: (...a: unknown[]) => mockGetProviderByUserId(...a),
}));

const mockInsertProfile = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../../../../src/lib/supabase/mutations', () => ({
  insertProviderProfile: (...a: unknown[]) => mockInsertProfile(...a),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
}));

const mockSetDraftProfile = jest.fn();
jest.mock('../../../../src/state/providerDraft', () => ({
  useProviderDraftStore: (sel: (s: { setProfile: unknown }) => unknown) =>
    sel({ setProfile: mockSetDraftProfile }),
}));

const mockAuthUser = { id: 'user-1' };
const mockSession = { user: { id: 'user-1' } };
const mockSetSession = jest.fn();
let mockIsProvider = false;
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: mockAuthUser, session: mockSession, setSession: mockSetSession }),
  selectIsProvider: () => mockIsProvider,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return {
    BadgeCheck: icon('BadgeCheck'),
    Check: icon('Check'),
    ShieldCheck: icon('ShieldCheck'),
    Wrench: icon('Wrench'),
  };
});
jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../../src/components/ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../../../src/components/ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID, disabled }: { label: string; onPress?: () => void; testID?: string; disabled?: boolean }) => (
      <TouchableOpacity onPress={disabled ? undefined : onPress} testID={testID} accessibilityState={{ disabled }}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

import ProviderScreen from '../provider';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsProvider = false;
  mockGetTypes.mockResolvedValue({
    data: [
      { id: 't1', name: 'DETAILER', label: 'Car Detailer' },
      { id: 't2', name: 'MECHANIC', label: 'Mechanic' },
    ],
    error: null,
  });
  mockInsertProfile.mockResolvedValue({ data: { id: 'pp-1' }, error: null });
  mockUpdateUser.mockResolvedValue({ data: { id: 'user-1', role: 'both' }, error: null });
  mockGetProviderByUserId.mockResolvedValue({
    data: { id: 'pp-1', verification_status: 'pending' },
    error: null,
  });
});

describe('ProviderScreen', () => {
  describe('customer (no provider role)', () => {
    it('renders the Become a Provider intro with type options', async () => {
      render(<ProviderScreen />);
      expect(screen.getByText('Become a Provider')).toBeTruthy();
      expect(await screen.findByTestId('provider-type-DETAILER')).toBeTruthy();
      expect(screen.getByTestId('provider-type-MECHANIC')).toBeTruthy();
    });

    it('creates the profile, promotes the role, and opens the vetting flow', async () => {
      render(<ProviderScreen />);
      fireEvent.press(await screen.findByTestId('provider-type-DETAILER'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('provider-start'));
      });
      expect(mockInsertProfile).toHaveBeenCalledWith({
        user_id: 'user-1',
        provider_type_id: 't1',
      });
      expect(mockSetDraftProfile).toHaveBeenCalledWith({ providerTypeId: 't1' });
      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { role: 'both' });
      expect(mockPush).toHaveBeenCalledWith('/(provider)/vetting');
    });
  });

  describe('existing provider', () => {
    beforeEach(() => {
      mockIsProvider = true;
    });

    it('shows the in-progress application state and continues to vetting', async () => {
      render(<ProviderScreen />);
      expect(await screen.findByText('Your application')).toBeTruthy();
      fireEvent.press(screen.getByTestId('provider-continue'));
      expect(mockPush).toHaveBeenCalledWith('/(provider)/vetting');
    });

    it('shows the approved state when verification_status is approved', async () => {
      mockGetProviderByUserId.mockResolvedValue({
        data: { id: 'pp-1', verification_status: 'approved' },
        error: null,
      });
      render(<ProviderScreen />);
      expect(await screen.findByText("You're a CarApp Provider")).toBeTruthy();
    });
  });
});
