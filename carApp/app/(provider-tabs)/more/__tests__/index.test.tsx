// index.test.tsx — unit tests for the provider More hub, focused on the
// dashboard switch (dual-role only) and its navigation targets.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockUser: {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
} | null = {
  full_name: 'Jordan Lee',
  email: 'jordan@example.com',
  phone: null,
  avatar_url: null,
};
let mockRole: string | null = 'both';

jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown; role: unknown }) => unknown) =>
    selector({ user: mockUser, role: mockRole }),
}));

const mockSetActiveMode = jest.fn();
jest.mock('../../../../src/state/mode', () => ({
  useModeStore: (selector: (s: { setActiveMode: unknown }) => unknown) =>
    selector({ setActiveMode: mockSetActiveMode }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockSignOut = jest.fn().mockResolvedValue({ data: true, error: null });
jest.mock('../../../../src/lib/supabase/auth', () => ({
  signOut: () => mockSignOut(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    ChevronRight: icon('ChevronRight'),
    LogOut: icon('LogOut'),
    Repeat: icon('Repeat'),
    Settings: icon('Settings'),
    ShieldCheck: icon('ShieldCheck'),
    SlidersHorizontal: icon('SlidersHorizontal'),
    User: icon('User'),
  };
});

jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return {
    Text: ({ children, ...props }: { children: React.ReactNode }) => (
      <Text {...props}>{children}</Text>
    ),
  };
});

jest.mock('../../../../src/components/ui/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View testID="avatar" /> };
});

jest.mock('../../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});

// ── Import after mocks ────────────────────────────────────────────────────────

import ProviderMoreScreen from '../index';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    full_name: 'Jordan Lee',
    email: 'jordan@example.com',
    phone: null,
    avatar_url: null,
  };
  mockRole = 'both';
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProviderMoreScreen', () => {
  it('renders the provider hub entry points', () => {
    render(<ProviderMoreScreen />);
    expect(screen.getByText('Services & Availability')).toBeTruthy();
    expect(screen.getByText('Application')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('shows the customer switch for a dual-role user', () => {
    mockRole = 'both';
    render(<ProviderMoreScreen />);
    expect(screen.getByText('Switch to Customer Dashboard')).toBeTruthy();
  });

  it('hides the customer switch for a pure provider account', () => {
    mockRole = 'provider';
    render(<ProviderMoreScreen />);
    expect(screen.queryByText('Switch to Customer Dashboard')).toBeNull();
  });

  it('switches into customer mode and replaces into the customer tabs', () => {
    mockRole = 'both';
    render(<ProviderMoreScreen />);
    fireEvent.press(screen.getByTestId('provider-switch-to-customer'));
    expect(mockSetActiveMode).toHaveBeenCalledWith('customer');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/search');
  });

  it('routes Services & Availability into the provider manage screen', () => {
    render(<ProviderMoreScreen />);
    fireEvent.press(screen.getByTestId('provider-more-manage'));
    expect(mockPush).toHaveBeenCalledWith('/(provider-tabs)/more/manage');
  });

  it('routes shared Account/Settings to the customer group screens', () => {
    render(<ProviderMoreScreen />);
    fireEvent.press(screen.getByTestId('provider-more-account'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/account');
    fireEvent.press(screen.getByTestId('provider-more-settings'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/settings');
  });

  it('prompts for confirmation before signing out', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<ProviderMoreScreen />);
    fireEvent.press(screen.getByTestId('provider-more-sign-out'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Sign out?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Sign out' }),
      ]),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('signs out when the destructive alert action is confirmed', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        const confirm = buttons?.find((b) => b.text === 'Sign out');
        confirm?.onPress?.();
      });
    render(<ProviderMoreScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('provider-more-sign-out'));
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});
