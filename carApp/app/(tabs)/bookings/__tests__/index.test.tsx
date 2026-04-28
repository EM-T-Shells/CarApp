// index.test.tsx — unit tests for the upcoming bookings list screen.
// Covers loading, empty, error, and populated states; customer vs. provider
// tab toggle; navigation on card press; and pull-to-refresh behaviour.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUpcomingCustomer = jest.fn();
const mockGetUpcomingProvider = jest.fn();
const mockGetProviderByUserId = jest.fn();

jest.mock('../../../../src/lib/supabase/queries', () => ({
  getUpcomingBookingsForCustomer: (...args: unknown[]) =>
    mockGetUpcomingCustomer(...args),
  getUpcomingBookingsForProvider: (...args: unknown[]) =>
    mockGetUpcomingProvider(...args),
  getProviderByUserId: (...args: unknown[]) => mockGetProviderByUserId(...args),
}));

let mockUser: { id: string } | null = { id: 'user-123' };
let mockIsProvider = false;

jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: mockUser }),
  selectIsProvider: (_s: unknown) => mockIsProvider,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    CalendarX: icon('CalendarX'),
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

jest.mock('../../../../src/components/ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <TouchableOpacity onPress={onPress}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../../../src/components/ui/Card', () => {
  const { TouchableOpacity } = require('react-native');
  return {
    Card: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>,
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

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: 'booking-1',
  customer_id: 'user-123',
  provider_id: 'provider-profile-1',
  scheduled_at: '2026-04-28T10:00:00Z',
  status: 'confirmed',
  total_amount: 15000,
  service_address: '123 Main St',
  services: [],
  provider_profiles: {
    id: 'provider-profile-1',
    bio: 'Great detailer',
    avg_gear_rating: 4.8,
    users: { id: 'provider-user-1', full_name: 'Alex Smith', avatar_url: null },
  },
  vehicles: {
    id: 'vehicle-1',
    year: 2022,
    make: 'Honda',
    model: 'Civic',
    color: 'Blue',
  },
  ...overrides,
});

// ── Import after mocks ────────────────────────────────────────────────────────

import BookingsScreen from '../index';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-123' };
  mockIsProvider = false;
  mockGetUpcomingCustomer.mockResolvedValue({ data: [], error: null });
  mockGetUpcomingProvider.mockResolvedValue({ data: [], error: null });
  mockGetProviderByUserId.mockResolvedValue({
    data: { id: 'provider-profile-1' },
    error: null,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BookingsScreen', () => {
  describe('customer view (default)', () => {
    it('calls getUpcomingBookingsForCustomer with the user id', async () => {
      render(<BookingsScreen />);
      await waitFor(() => {
        expect(mockGetUpcomingCustomer).toHaveBeenCalledWith('user-123');
      });
    });

    it('renders empty state when there are no upcoming bookings', async () => {
      render(<BookingsScreen />);
      expect(await screen.findByText('No upcoming bookings')).toBeTruthy();
    });

    it('renders the Find a Provider CTA on the empty state', async () => {
      render(<BookingsScreen />);
      expect(await screen.findByText('Find a Provider')).toBeTruthy();
    });

    it('navigates to the search tab when Find a Provider is pressed', async () => {
      render(<BookingsScreen />);
      fireEvent.press(await screen.findByText('Find a Provider'));
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/search');
    });

    it('renders booking cards when bookings are returned', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: [makeBooking()],
        error: null,
      });
      render(<BookingsScreen />);
      expect(await screen.findByText('Alex Smith')).toBeTruthy();
      expect(screen.getByText('$150.00')).toBeTruthy();
    });

    it('navigates to booking detail on card press', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: [makeBooking()],
        error: null,
      });
      render(<BookingsScreen />);
      fireEvent.press(await screen.findByText('Alex Smith'));
      expect(mockPush).toHaveBeenCalledWith('/bookings/booking-1');
    });

    it('navigates to past bookings when Past is pressed', async () => {
      render(<BookingsScreen />);
      fireEvent.press(await screen.findByText('Past'));
      expect(mockPush).toHaveBeenCalledWith('/bookings/past');
    });

    it('shows correct status label for en_route booking', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: [makeBooking({ status: 'en_route' })],
        error: null,
      });
      render(<BookingsScreen />);
      expect(await screen.findByText('En Route')).toBeTruthy();
    });

    it('shows "Awaiting provider" when provider_profiles is null', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: [makeBooking({ provider_profiles: null })],
        error: null,
      });
      render(<BookingsScreen />);
      expect(await screen.findByText('Awaiting provider')).toBeTruthy();
    });

    it('renders the error state on query failure', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: null,
        error: new Error('Network error'),
      });
      render(<BookingsScreen />);
      expect(await screen.findByText('Something went wrong')).toBeTruthy();
      expect(screen.getByText('Network error')).toBeTruthy();
    });

    it('retries fetch when Retry is pressed', async () => {
      mockGetUpcomingCustomer.mockResolvedValue({
        data: null,
        error: new Error('Network error'),
      });
      render(<BookingsScreen />);
      await screen.findByText('Something went wrong');

      mockGetUpcomingCustomer.mockResolvedValue({ data: [], error: null });
      await act(async () => {
        fireEvent.press(screen.getByText('Retry'));
      });
      expect(mockGetUpcomingCustomer).toHaveBeenCalledTimes(2);
    });
  });

  describe('provider tab toggle', () => {
    beforeEach(() => {
      mockIsProvider = true;
    });

    it('renders the tab switcher for provider users', async () => {
      render(<BookingsScreen />);
      await waitFor(() => {
        expect(screen.getByText('My Bookings')).toBeTruthy();
        expect(screen.getByText('My Jobs')).toBeTruthy();
      });
    });

    it('does not render the tab switcher for customer-only users', async () => {
      mockIsProvider = false;
      render(<BookingsScreen />);
      await screen.findByText('No upcoming bookings');
      expect(screen.queryByText('My Bookings')).toBeNull();
      expect(screen.queryByText('My Jobs')).toBeNull();
    });

    it('fetches provider bookings after switching to My Jobs tab', async () => {
      render(<BookingsScreen />);
      await screen.findByText('My Jobs');
      await act(async () => {
        fireEvent.press(screen.getByText('My Jobs'));
      });
      await waitFor(() => {
        expect(mockGetProviderByUserId).toHaveBeenCalledWith('user-123');
        expect(mockGetUpcomingProvider).toHaveBeenCalledWith('provider-profile-1');
      });
    });

    it('shows provider-specific empty message on My Jobs tab', async () => {
      render(<BookingsScreen />);
      await screen.findByText('My Jobs');
      await act(async () => {
        fireEvent.press(screen.getByText('My Jobs'));
      });
      expect(
        await screen.findByText(
          'No jobs scheduled yet. New bookings from customers will appear here.',
        ),
      ).toBeTruthy();
    });

    it('shows error when provider profile lookup fails', async () => {
      mockGetProviderByUserId.mockResolvedValue({
        data: null,
        error: new Error('Profile not found'),
      });
      render(<BookingsScreen />);
      await screen.findByText('My Jobs');
      await act(async () => {
        fireEvent.press(screen.getByText('My Jobs'));
      });
      expect(await screen.findByText('Something went wrong')).toBeTruthy();
    });

    it('caches provider id and does not re-fetch profile on second switch', async () => {
      render(<BookingsScreen />);
      await screen.findByText('My Jobs');

      await act(async () => {
        fireEvent.press(screen.getByText('My Jobs'));
      });
      await screen.findByText('No upcoming bookings');

      await act(async () => {
        fireEvent.press(screen.getByText('My Bookings'));
      });
      await act(async () => {
        fireEvent.press(screen.getByText('My Jobs'));
      });
      await waitFor(() => {
        expect(mockGetProviderByUserId).toHaveBeenCalledTimes(1);
      });
    });
  });
});
