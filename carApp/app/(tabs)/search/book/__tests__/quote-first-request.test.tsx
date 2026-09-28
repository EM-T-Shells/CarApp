// quote-first-request.test.tsx — what the booking screen does when the
// customer taps the final button.
//
// The row goes in unpriced, both ends of the arrival window travel with it,
// and the customer's card is SAVED (SetupIntent) but nothing is CHARGED: no
// PaymentIntent of any kind is created at request time (spec §2, §5). A card
// that is not saved cancels the request, and photos go up before the provider
// is told the request exists.
//
// Supabase is mocked, like every Jest suite here — these assert the payload the
// screen builds, not that Postgres accepts it. verify-checkout.mjs is what
// proves the payload against the real grants.

import React from 'react';
import { Alert } from 'react-native';
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

// One ordered log across every collaborator, so the tests can assert the
// sequence (insert → save card → photos → confirm), not just that each ran.
const calls: string[] = [];

const mockInsertBooking = jest.fn();
const mockUpdateBooking = jest.fn();
jest.mock('../../../../../src/lib/supabase/mutations', () => ({
  insertBooking: (...args: unknown[]) => {
    calls.push('insertBooking');
    return mockInsertBooking(...args);
  },
  updateBooking: (...args: unknown[]) => {
    calls.push('updateBooking');
    return mockUpdateBooking(...args);
  },
  isSlotUnavailableError: () => false,
}));

const mockUploadIntakePhoto = jest.fn();
jest.mock('../../../../../src/components/booking/IntakePhotoUploader', () => ({
  __esModule: true,
  default: () => null,
  uploadIntakePhoto: (...args: unknown[]) => {
    calls.push('uploadIntakePhoto');
    return mockUploadIntakePhoto(...args);
  },
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
  getServiceDurationModifiers: jest.fn(async () => ({ data: [], error: null })),
}));

// Every Stripe export is a spy. The three card-saving calls are configurable;
// anything that could charge a card is recorded so the tests can assert it
// never ran.
const mockCreateSetupIntent = jest.fn();
const mockPresentCardSetupSheet = jest.fn();
const mockConfirmSetupIntent = jest.fn();
jest.mock('../../../../../src/lib/stripe', () => {
  const record = (name: string) => (...args: unknown[]) => {
    calls.push(name);
    return Promise.resolve({ data: null, error: null, args });
  };
  // The mocks are read at call time: this factory is hoisted above their
  // declarations, so capturing them here would capture undefined.
  const spy = (name: string, fn: () => jest.Mock) => (...args: unknown[]) => {
    calls.push(name);
    return fn()(...args);
  };
  return {
    createSetupIntent: spy('createSetupIntent', () => mockCreateSetupIntent),
    presentCardSetupSheet: spy('presentCardSetupSheet', () => mockPresentCardSetupSheet),
    confirmSetupIntent: spy('confirmSetupIntent', () => mockConfirmSetupIntent),
    createDepositPaymentIntent: record('createDepositPaymentIntent'),
    presentDepositPaymentSheet: record('presentDepositPaymentSheet'),
    submitQuote: record('submitQuote'),
    acceptQuote: record('acceptQuote'),
  };
});

const mockAlert = jest.fn();

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

const PHOTO = { key: 'p1', uri: 'file:///p1.jpg', mimeType: 'image/jpeg', fileSize: 1000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(mockAlert);
  calls.length = 0;
  useBookingDraftStore.getState().reset();
  mockInsertBooking.mockResolvedValue({
    data: { id: 'book-1', deposit_amount: 20 },
    error: null,
  });
  mockUpdateBooking.mockResolvedValue({ data: { id: 'book-1' }, error: null });
  mockCreateSetupIntent.mockResolvedValue({
    data: { clientSecret: 'seti_secret', setupIntentId: 'seti_1' },
    error: null,
  });
  mockPresentCardSetupSheet.mockResolvedValue({ data: { canceled: false }, error: null });
  mockConfirmSetupIntent.mockResolvedValue({ data: { ok: true, card_saved: true }, error: null });
  mockUploadIntakePhoto.mockResolvedValue({ data: { id: 'photo-1' }, error: null });
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

  // Spec §2: the card is saved at request time, and nothing is charged until
  // the customer approves the final price.
  it('saves a card for the new request and charges nothing', async () => {
    await renderAndSubmit();

    await waitFor(() => expect(mockConfirmSetupIntent).toHaveBeenCalledWith('book-1'));
    expect(mockCreateSetupIntent).toHaveBeenCalledWith('book-1');
    expect(mockPresentCardSetupSheet).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'seti_secret' }),
    );
    for (const charge of ['createDepositPaymentIntent', 'presentDepositPaymentSheet', 'acceptQuote']) {
      expect(calls).not.toContain(charge);
    }
  });

  it('navigates to the booking once the card is saved', async () => {
    await renderAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/bookings/book-1'));
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  // The provider is only told about a request once the card is confirmed, so an
  // abandoned one never reaches them — and it must not linger either.
  it('cancels the request when the card sheet is dismissed', async () => {
    mockPresentCardSetupSheet.mockResolvedValue({ data: { canceled: true }, error: null });

    await renderAndSubmit();

    await waitFor(() =>
      expect(mockUpdateBooking).toHaveBeenCalledWith('book-1', { status: 'cancelled' }),
    );
    expect(mockConfirmSetupIntent).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    // Dismissing is a normal outcome, not a failure to shout about.
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('cancels the request and explains when the card cannot be saved', async () => {
    mockPresentCardSetupSheet.mockResolvedValue({ data: null, error: new Error('Card declined') });

    await renderAndSubmit();

    await waitFor(() =>
      expect(mockUpdateBooking).toHaveBeenCalledWith('book-1', { status: 'cancelled' }),
    );
    expect(mockAlert).toHaveBeenCalledWith('Card not saved', 'Card declined');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cancels the request when card setup cannot start', async () => {
    mockCreateSetupIntent.mockResolvedValue({ data: null, error: new Error('Stripe down') });

    await renderAndSubmit();

    await waitFor(() =>
      expect(mockUpdateBooking).toHaveBeenCalledWith('book-1', { status: 'cancelled' }),
    );
    expect(mockPresentCardSetupSheet).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith('Could not save your card', 'Stripe down');
  });

  it('uploads the photos before the provider is told the request exists', async () => {
    await act(async () => {
      useBookingDraftStore.getState().addIntakePhoto(PHOTO);
    });

    await renderAndSubmit();

    await waitFor(() => expect(mockConfirmSetupIntent).toHaveBeenCalled());
    expect(mockUploadIntakePhoto).toHaveBeenCalledWith('book-1', PHOTO);
    expect(calls.indexOf('uploadIntakePhoto')).toBeGreaterThan(calls.indexOf('presentCardSetupSheet'));
    expect(calls.indexOf('uploadIntakePhoto')).toBeLessThan(calls.indexOf('confirmSetupIntent'));
  });

  it('keeps the request when a photo fails, and says so', async () => {
    mockUploadIntakePhoto.mockResolvedValue({ data: null, error: new Error('timeout') });
    await act(async () => {
      useBookingDraftStore.getState().addIntakePhoto(PHOTO);
    });

    await renderAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/bookings/book-1'));
    expect(mockUpdateBooking).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      'Some photos did not upload',
      expect.stringContaining('1 photo could not be added'),
    );
  });
});
