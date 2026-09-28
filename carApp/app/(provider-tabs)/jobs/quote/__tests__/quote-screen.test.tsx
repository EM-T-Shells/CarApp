// quote-screen.test.tsx — the provider's quote screen: the pre-filled
// surcharges, the intake photos, sending a request back, and declining it.
// Supabase and the Edge Function wrappers are mocked.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'book-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../../../../../src/components/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="sheet">{children}</View> : null,
  };
});

const mockGetJob = jest.fn();
const mockGetPhotos = jest.fn();
const mockGetModifiers = jest.fn();
jest.mock('../../../../../src/lib/supabase/queries', () => ({
  getProviderJobById: (...a: unknown[]) => mockGetJob(...a),
  getBookingPhotos: (...a: unknown[]) => mockGetPhotos(...a),
  getServiceDurationModifiers: (...a: unknown[]) => mockGetModifiers(...a),
}));

const mockSubmitQuote = jest.fn();
const mockRequestMore = jest.fn();
const mockProviderCancel = jest.fn();
jest.mock('../../../../../src/lib/stripe', () => ({
  submitQuote: (...a: unknown[]) => mockSubmitQuote(...a),
  requestMorePhotos: (...a: unknown[]) => mockRequestMore(...a),
  providerCancelBooking: (...a: unknown[]) => mockProviderCancel(...a),
}));

import QuoteRequestScreen from '../[bookingId]';

const JOB = {
  id: 'book-1',
  provider_id: 'prov-1',
  status: 'pending_provider_quote',
  total_amount: 153,
  suggested_duration_mins: 150,
  estimated_duration_mins: 120,
  requested_window_start: '2026-10-14T12:00:00.000Z',
  requested_window_end: '2026-10-14T16:00:00.000Z',
  vehicle_size_class: 'suv',
  condition_answers: { soil_level: 'heavy' },
  info_request_note: null,
  customer: { full_name: 'Casey' },
  vehicles: { year: '2021', make: 'Subaru', model: 'Outback' },
  service_address: '1 Main St',
  notes: null,
};

const MODIFIERS = [
  { id: 'm1', provider_id: 'prov-1', factor_type: 'size_class', factor_value: 'suv', delta_mins: 30, delta_price: 30, created_at: '' },
  { id: 'm2', provider_id: 'prov-1', factor_type: 'soil_level', factor_value: 'heavy', delta_mins: 45, delta_price: 25, created_at: '' },
  { id: 'm3', provider_id: 'prov-1', factor_type: 'size_class', factor_value: 'truck', delta_mins: 40, delta_price: 40, created_at: '' },
];

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockImplementation(() => {});
  mockGetJob.mockResolvedValue({ data: JOB, error: null });
  mockGetPhotos.mockResolvedValue({
    data: [
      { id: 'ph1', photo_type: 'intake', storage_url: 'https://1' },
      { id: 'ph2', photo_type: 'before', storage_url: 'https://2' },
    ],
    error: null,
  });
  mockGetModifiers.mockResolvedValue({ data: MODIFIERS, error: null });
  mockSubmitQuote.mockResolvedValue({ data: { ok: true }, error: null });
  mockRequestMore.mockResolvedValue({ data: { ok: true }, error: null });
  mockProviderCancel.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('provider quote screen', () => {
  it('leads with the customer’s intake photos only', async () => {
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByText('Photos from the customer (1)'));
    expect(view.getByLabelText('Customer photo 1')).toBeTruthy();
  });

  // The price half of the modifiers that produced the suggested duration:
  // one line per matching factor, editable, sent as stated.
  it('pre-fills surcharges from the provider’s own modifiers and sends them', async () => {
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByTestId('send-quote'));
    await act(async () => {
      fireEvent.press(view.getByTestId('send-quote'));
    });
    expect(mockSubmitQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'book-1',
        estimatedDurationMins: 150,
        lineItems: [
          { label: 'Vehicle size: SUV / Crossover', amount_cents: 3000 },
          { label: 'Interior condition: Heavily soiled', amount_cents: 2500 },
        ],
      }),
    );
  });

  it('starts with no surcharges when the provider has no modifiers', async () => {
    mockGetModifiers.mockResolvedValue({ data: [], error: null });
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByTestId('send-quote'));
    await act(async () => {
      fireEvent.press(view.getByTestId('send-quote'));
    });
    expect(mockSubmitQuote.mock.calls[0][0].lineItems).toEqual([]);
  });

  it('sends the request back with a note', async () => {
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByTestId('ask-for-more'));
    fireEvent.press(view.getByTestId('ask-for-more'));
    fireEvent.changeText(view.getByTestId('ask-note'), '  Back seats please ');
    await act(async () => {
      fireEvent.press(view.getByTestId('ask-send'));
    });
    expect(mockRequestMore).toHaveBeenCalledWith('book-1', 'Back seats please');
  });

  it('declines through the server, after confirming', async () => {
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByTestId('decline-request'));
    fireEvent.press(view.getByTestId('decline-request'));
    expect(mockProviderCancel).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Decline')!.onPress!();
    });
    expect(mockProviderCancel).toHaveBeenCalledWith('book-1');
    expect(mockBack).toHaveBeenCalled();
  });

  // submit_quote accepts a sent-back request, so it stays quotable — but it
  // cannot be sent back a second time while it is already with the customer.
  it('still quotes a sent-back request, without offering to send it back again', async () => {
    mockGetJob.mockResolvedValue({
      data: { ...JOB, status: 'awaiting_customer_info', info_request_note: 'Back seats please' },
      error: null,
    });
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByTestId('send-quote'));
    expect(view.getByText('You asked: “Back seats please”')).toBeTruthy();
    expect(view.queryByTestId('ask-for-more')).toBeNull();
  });

  it('does not offer a quote once the request has moved on', async () => {
    mockGetJob.mockResolvedValue({ data: { ...JOB, status: 'pending_customer_approval' }, error: null });
    const view = render(<QuoteRequestScreen />);
    await waitFor(() => view.getByText('This request is no longer waiting on your quote.'));
    expect(view.queryByTestId('send-quote')).toBeNull();
  });
});
