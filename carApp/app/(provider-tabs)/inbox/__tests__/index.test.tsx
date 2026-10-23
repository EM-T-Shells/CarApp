// index.test.tsx — unit tests for the provider inbox list (Inbox tab root).
// Covers provider-profile resolution, fetch, empty state, and navigation into
// the shared thread detail screen.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetThreadsForProvider = jest.fn();
const mockGetProviderByUserId = jest.fn();

jest.mock('../../../../src/lib/supabase/queries', () => ({
  getThreadsForProvider: (...args: unknown[]) => mockGetThreadsForProvider(...args),
  getProviderByUserId: (...args: unknown[]) => mockGetProviderByUserId(...args),
}));

let mockUser: { id: string } | null = { id: 'user-123' };

jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: mockUser }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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
    MessageSquare: icon('MessageSquare'),
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

jest.mock('../../../../src/components/ui/Card', () => {
  const { TouchableOpacity } = require('react-native');
  return {
    Card: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>
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

jest.mock('../../../../src/utils/date', () => ({
  formatShortDate: () => 'Mon, Apr 28',
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeThread = (overrides: Record<string, unknown> = {}) => ({
  id: 'thread-1',
  bookings: { id: 'job-1', status: 'confirmed', scheduled_at: '2026-04-28T10:00:00Z' },
  ...overrides,
});

// ── Import after mocks ────────────────────────────────────────────────────────

import ProviderInboxScreen from '../index';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-123' };
  mockGetProviderByUserId.mockResolvedValue({
    data: { id: 'provider-profile-1' },
    error: null,
  });
  mockGetThreadsForProvider.mockResolvedValue({ data: [], error: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProviderInboxScreen', () => {
  it('resolves the provider profile then fetches its threads', async () => {
    render(<ProviderInboxScreen />);
    await waitFor(() => {
      expect(mockGetProviderByUserId).toHaveBeenCalledWith('user-123');
      expect(mockGetThreadsForProvider).toHaveBeenCalledWith('provider-profile-1');
    });
  });

  it('renders the empty state when there are no threads', async () => {
    render(<ProviderInboxScreen />);
    expect(await screen.findByText('No messages yet')).toBeTruthy();
  });

  it('renders a thread labeled by its booking context', async () => {
    mockGetThreadsForProvider.mockResolvedValue({
      data: [makeThread()],
      error: null,
    });
    render(<ProviderInboxScreen />);
    expect(await screen.findByText('Job · Mon, Apr 28')).toBeTruthy();
  });

  it('opens the shared customer-group thread detail on press', async () => {
    mockGetThreadsForProvider.mockResolvedValue({
      data: [makeThread()],
      error: null,
    });
    render(<ProviderInboxScreen />);
    fireEvent.press(await screen.findByText('Job · Mon, Apr 28'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox/thread-1');
  });
});
