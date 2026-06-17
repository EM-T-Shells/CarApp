// index.test.tsx — unit tests for the Inbox thread list (Flow 3.4).

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockGetThreads = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getThreadsForCustomer: (...a: unknown[]) => mockGetThreads(...a),
}));

const mockAuthUser = { id: 'user-1' };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: mockAuthUser }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { ChevronRight: icon('ChevronRight'), MessageSquare: icon('MessageSquare') };
});

jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../../src/components/ui/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View testID="avatar" /> };
});
jest.mock('../../../../src/components/ui/Card', () => {
  const { TouchableOpacity } = require('react-native');
  return {
    Card: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>
    ),
  };
});

jest.mock('../../../../src/utils/date', () => ({
  formatShortDate: () => 'Mon, Apr 28',
}));

const makeThread = (o: Record<string, unknown> = {}) => ({
  id: 'thread-1',
  booking_id: 'booking-1',
  customer_id: 'user-1',
  provider_id: 'pp-1',
  created_at: '2026-01-01T00:00:00Z',
  bookings: { id: 'booking-1', status: 'confirmed', scheduled_at: '2026-04-28T10:00:00Z' },
  provider_profiles: { id: 'pp-1', users: { id: 'pu-1', full_name: 'Alex Smith', avatar_url: null } },
  ...o,
});

import InboxScreen from '../index';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetThreads.mockResolvedValue({ data: [makeThread()], error: null });
});

describe('InboxScreen', () => {
  it('fetches threads for the signed-in customer', async () => {
    render(<InboxScreen />);
    await waitFor(() => expect(mockGetThreads).toHaveBeenCalledWith('user-1'));
  });

  it('renders a thread row with provider name and booking context', async () => {
    render(<InboxScreen />);
    expect(await screen.findByText('Alex Smith')).toBeTruthy();
    expect(screen.getByText('Confirmed · Mon, Apr 28')).toBeTruthy();
  });

  it('navigates to the thread detail on press', async () => {
    render(<InboxScreen />);
    fireEvent.press(await screen.findByText('Alex Smith'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox/thread-1');
  });

  it('falls back to CarApp Support when no provider is attached', async () => {
    mockGetThreads.mockResolvedValue({
      data: [makeThread({ provider_profiles: null, bookings: null })],
      error: null,
    });
    render(<InboxScreen />);
    expect(await screen.findByText('CarApp Support')).toBeTruthy();
    expect(screen.getByText('Conversation')).toBeTruthy();
  });

  it('renders the empty state when there are no threads', async () => {
    mockGetThreads.mockResolvedValue({ data: [], error: null });
    render(<InboxScreen />);
    expect(await screen.findByText('No messages yet')).toBeTruthy();
  });

  it('renders the error state on failure', async () => {
    mockGetThreads.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<InboxScreen />);
    expect(await screen.findByText("Couldn't load your inbox")).toBeTruthy();
  });
});
