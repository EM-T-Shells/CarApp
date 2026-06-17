// index.test.tsx — unit tests for the More tab hub (Flow 3.3).
// Covers profile summary rendering, navigation routing for each entry point,
// the role-adaptive Provider row, and the sign-out confirmation flow.

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
let mockIsProvider = false;

jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: mockUser }),
  selectIsProvider: () => mockIsProvider,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignOut = jest.fn().mockResolvedValue({ data: true, error: null });
jest.mock('../../../../src/lib/supabase/auth', () => ({
  signOut: () => mockSignOut(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    Bot: icon('Bot'),
    ChevronRight: icon('ChevronRight'),
    Clock: icon('Clock'),
    LogOut: icon('LogOut'),
    Settings: icon('Settings'),
    User: icon('User'),
    Wrench: icon('Wrench'),
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

import MoreScreen from '../index';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    full_name: 'Jordan Lee',
    email: 'jordan@example.com',
    phone: null,
    avatar_url: null,
  };
  mockIsProvider = false;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MoreScreen', () => {
  it('renders the profile summary with name and contact', () => {
    render(<MoreScreen />);
    expect(screen.getByText('Jordan Lee')).toBeTruthy();
    expect(screen.getByText('jordan@example.com')).toBeTruthy();
  });

  it('falls back to the phone number when no email is present', () => {
    mockUser = {
      full_name: 'Sam Doe',
      email: null,
      phone: '+15551234567',
      avatar_url: null,
    };
    render(<MoreScreen />);
    expect(screen.getByText('+15551234567')).toBeTruthy();
  });

  it('renders all navigation entry points', () => {
    render(<MoreScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Booking history')).toBeTruthy();
    expect(screen.getByText('Ask Lug')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('navigates to account from the profile card', () => {
    render(<MoreScreen />);
    fireEvent.press(screen.getByTestId('more-profile-card'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/account');
  });

  it('routes each entry point to the correct screen', () => {
    render(<MoreScreen />);
    fireEvent.press(screen.getByTestId('more-account'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/account');
    fireEvent.press(screen.getByTestId('more-settings'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/settings');
    fireEvent.press(screen.getByTestId('more-history'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/bookings/past');
    fireEvent.press(screen.getByTestId('more-lug'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/lug');
    fireEvent.press(screen.getByTestId('more-provider'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/provider');
  });

  it('shows "Become a Provider" for non-providers', () => {
    mockIsProvider = false;
    render(<MoreScreen />);
    expect(screen.getByText('Become a Provider')).toBeTruthy();
    expect(screen.queryByText('Provider Dashboard')).toBeNull();
  });

  it('shows "Provider Dashboard" for providers', () => {
    mockIsProvider = true;
    render(<MoreScreen />);
    expect(screen.getByText('Provider Dashboard')).toBeTruthy();
    expect(screen.queryByText('Become a Provider')).toBeNull();
  });

  it('prompts for confirmation before signing out', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<MoreScreen />);
    fireEvent.press(screen.getByTestId('more-sign-out'));
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
    render(<MoreScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('more-sign-out'));
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});
