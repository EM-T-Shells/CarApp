// index.test.tsx — unit tests for the provider job queue (Jobs tab root).
// Covers provider-profile resolution, fetch, empty state, card render, and
// navigation into the job detail screen.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUpcomingProvider = jest.fn();
const mockGetProviderByUserId = jest.fn();

jest.mock('../../../../src/lib/supabase/queries', () => ({
  getUpcomingBookingsForProvider: (...args: unknown[]) =>
    mockGetUpcomingProvider(...args),
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
    Briefcase: icon('Briefcase'),
    ChevronRight: icon('ChevronRight'),
    Clock: icon('Clock'),
    Car: icon('Car'),
  };
});

jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return {
    Text: ({ children, style, ...props }: { children: React.ReactNode; style?: unknown }) => (
      <Text style={style} {...props}>{children}</Text>
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

jest.mock('../../../../src/utils/money', () => ({
  centsToDisplay: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

jest.mock('../../../../src/utils/date', () => ({
  formatShortDate: () => 'Mon, Apr 28',
  formatTime: () => '10:00 AM',
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  provider_id: 'provider-profile-1',
  scheduled_at: '2026-04-28T10:00:00Z',
  status: 'confirmed',
  total_amount: 15000,
  vehicles: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Blue' },
  ...overrides,
});

// ── Import after mocks ────────────────────────────────────────────────────────

import ProviderJobsScreen from '../index';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-123' };
  mockGetProviderByUserId.mockResolvedValue({
    data: { id: 'provider-profile-1' },
    error: null,
  });
  mockGetUpcomingProvider.mockResolvedValue({ data: [], error: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProviderJobsScreen', () => {
  it('resolves the provider profile then fetches its upcoming jobs', async () => {
    render(<ProviderJobsScreen />);
    await waitFor(() => {
      expect(mockGetProviderByUserId).toHaveBeenCalledWith('user-123');
      expect(mockGetUpcomingProvider).toHaveBeenCalledWith('provider-profile-1');
    });
  });

  it('renders the empty state when there are no jobs', async () => {
    render(<ProviderJobsScreen />);
    expect(await screen.findByText('No jobs scheduled')).toBeTruthy();
  });

  it('renders a job card with its total', async () => {
    mockGetUpcomingProvider.mockResolvedValue({ data: [makeJob()], error: null });
    render(<ProviderJobsScreen />);
    expect(await screen.findByText('$150.00')).toBeTruthy();
  });

  it('surfaces the action-needed label for a pending-approval job', async () => {
    mockGetUpcomingProvider.mockResolvedValue({
      data: [makeJob({ status: 'pending_provider_approval' })],
      error: null,
    });
    render(<ProviderJobsScreen />);
    expect(await screen.findByText('Action Needed')).toBeTruthy();
  });

  it('navigates to the job detail on card press', async () => {
    mockGetUpcomingProvider.mockResolvedValue({ data: [makeJob()], error: null });
    render(<ProviderJobsScreen />);
    fireEvent.press(await screen.findByText('$150.00'));
    expect(mockPush).toHaveBeenCalledWith('/(provider-tabs)/jobs/job-1');
  });

  it('navigates to past jobs when Past is pressed', async () => {
    render(<ProviderJobsScreen />);
    fireEvent.press(await screen.findByText('Past'));
    expect(mockPush).toHaveBeenCalledWith('/(provider-tabs)/jobs/past');
  });

  it('shows the error state when the profile lookup fails', async () => {
    mockGetProviderByUserId.mockResolvedValue({
      data: null,
      error: new Error('Profile not found'),
    });
    render(<ProviderJobsScreen />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });
});
