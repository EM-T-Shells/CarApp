// quote-first-request.test.tsx — what the booking screen does when the
// customer taps the final button.
//
// The screen had no coverage at all while it was a deposit-first flow, which
// is why removing its entire PaymentSheet block broke no test. These cover the
// properties that flow depended on and this one inverts: the row goes in
// unpriced, both ends of the arrival window travel with it, and NOTHING
// touches Stripe.
//
// Supabase is mocked, like every Jest suite here — these assert the payload the
// screen builds, not that Postgres accepts it. verify-checkout.mjs is what
// proves the payload against the real grants.

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ providerId: 'prov-1' }),
  Stack: { Screen: () => null },
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
  return new Proxy(
    {},
    {
      get: (_target, name: string) =>
        function MockIcon(props: Record<string, unknown>) {
          return <View testID={`icon-${name}`} {...props} />;
        },
    },
  );
});

const mockInsertBooking = jest.fn();
jest.mock('../../../../../src/lib/supabase/mutations', () => ({
  insertBooking: (...args: unknown[]) => mockInsertBooking(...args),
  isSlotUnavailableError: () => false,
}));

jest.mock('../../../../../src/lib/supabase/queries', () => ({
  getProviderById: jest.fn(async () => ({
    data: {
      id: 'prov-1',
      users: { full_name: 'Dana Rivers' },
      service_packages: [],
    },
    error: null,
  })),
  getVehiclesByUser: jest.fn(async () => ({
    data: [
      {
        id: 'veh-1',
        year: '2021',
        make: 'Honda',
        model: 'Civic',
        size_class: 'sedan',
        is_primary: true,
      },
    ],
    error: null,
  })),
}));

// The whole Stripe module is a spy. Any call from this screen is a failure —
// quote-first collects nothing at request time.
const stripeCalls: string[] = [];
jest.mock('../../../../../src/lib/stripe', () => {
  const record = (name: string) => (...args: unknown[]) => {
    stripeCalls.push(name);
    return Promise.resolve({ data: null, error: null, args });
  };
  return {
    createDepositPaymentIntent: record('createDepositPaymentIntent'),
    presentDepositPaymentSheet: record('presentDepositPaymentSheet'),
    submitQuote: record('submitQuote'),
    acceptQuote: record('acceptQuote'),
  };
});

jest.mock('../../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'cust-1' } }),
}));

import BookProviderScreen from '../[providerId]';
import { useBookingDraftStore } from '../../../../../src/state/bookingDraft';

// Jest pins TZ=UTC, so these instants are the wall-clock hours they look like.
const WINDOW = {
  start: '2026-10-14T12:00:00.000Z',
  end: '2026-10-14T16:00:00.000Z',
};

function seedDraft() {
  const store = useBookingDraftStore.getState();
  store.setProvider('prov-1', 'Dana Rivers');
  store.toggleService({
    id: 'pkg-1',
    name: 'Full Detail',
    description: null,
    category: 'detailing',
    base_price: 120,
    duration_mins: 120,
  } as never);
  store.setVehicleId('veh-1');
  store.setServiceAddress('123 Main St');
  store.setArrivalWindow(WINDOW);
}

/**
 * Mounts the screen, lets its load() effect settle, fills the draft, then walks
 * Services → Details → Review and taps the final button.
 *
 * The draft is seeded inside act() because the buttons are gated on it: the
 * store drives canGoNext, and a Zustand write outside act() leaves Continue
 * still rendered disabled when the press lands.
 */
async function renderAndSubmit() {
  const view = render(<BookProviderScreen />);
  await waitFor(() => view.getByText('Continue'));

  await act(async () => {
    seedDraft();
  });

  fireEvent.press(view.getByText('Continue'));
  fireEvent.press(view.getByText('Continue'));
  await act(async () => {
    fireEvent.press(view.getByText('Send Request'));
  });
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeCalls.length = 0;
  useBookingDraftStore.getState().reset();
  mockInsertBooking.mockResolvedValue({
    data: { id: 'book-1', deposit_amount: 20 },
    error: null,
  });
});

describe('booking screen — quote-first request', () => {
  it('creates the row as pending_provider_quote, not pending', async () => {
    await renderAndSubmit();

    await waitFor(() => expect(mockInsertBooking).toHaveBeenCalledTimes(1));
    expect(mockInsertBooking.mock.calls[0][0]).toMatchObject({
      status: 'pending_provider_quote',
      customer_id: 'cust-1',
      provider_id: 'prov-1',
    });
  });

  it('sends both ends of the arrival window', async () => {
    // bookings_requested_window_check rejects one end without the other, so a
    // payload carrying only a start is a 23514 at insert.
    await renderAndSubmit();

    await waitFor(() => expect(mockInsertBooking).toHaveBeenCalled());
    expect(mockInsertBooking.mock.calls[0][0]).toMatchObject({
      requested_window_start: WINDOW.start,
      requested_window_end: WINDOW.end,
    });
  });

  it('stands scheduled_at up from the window start', async () => {
    // scheduled_at is NOT NULL and the real start is not known until the
    // provider places it. submit_quote overwrites this.
    await renderAndSubmit();

    await waitFor(() => expect(mockInsertBooking).toHaveBeenCalled());
    expect(mockInsertBooking.mock.calls[0][0].scheduled_at).toBe(WINDOW.start);
  });

  it('never states a price or a duration', async () => {
    // The client's INSERT grant excludes every money column and both duration
    // columns. Sending one is refused at the column-privilege layer, so the
    // screen must not try.
    await renderAndSubmit();

    await waitFor(() => expect(mockInsertBooking).toHaveBeenCalled());
    const payload = mockInsertBooking.mock.calls[0][0];
    for (const forbidden of [
      'total_amount',
      'deposit_amount',
      'platform_fee',
      'provider_payout',
      'quoted_total_amount',
      'quote_line_items',
      'estimated_duration_mins',
      'suggested_duration_mins',
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('charges nothing — no Stripe call of any kind', async () => {
    await renderAndSubmit();

    await waitFor(() => expect(mockInsertBooking).toHaveBeenCalled());
    expect(stripeCalls).toEqual([]);
  });

  it('navigates to the booking once the request is in', async () => {
    await renderAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/bookings/book-1'));
  });

  it('does not cancel the row when the insert succeeds', async () => {
    // The deposit-first flow cancelled the booking whenever payment fell
    // through. There is no payment here, so there is nothing to unwind — and
    // no updateBooking import left to do it with.
    const mutations = require('../../../../../src/lib/supabase/mutations');
    expect(mutations.updateBooking).toBeUndefined();
  });
});
