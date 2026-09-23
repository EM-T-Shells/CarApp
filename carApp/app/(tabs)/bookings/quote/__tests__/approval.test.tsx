// approval.test.tsx — the customer quote approval screen.
//
// This is where money enters the quote flow, so these cover the sequencing
// rules rather than the layout: approve first and charge second, take the
// amounts from the server, and never assert the booking is paid.

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'book-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// Spied rather than jest.mock'd: replacing the Alert module leaves the Alert
// imported from 'react-native' undefined, and the screen calls Alert.alert on
// every failure path these tests exercise.
import { Alert } from 'react-native';
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockGetBookingById = jest.fn();
jest.mock('../../../../../src/lib/supabase/queries', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

// Calls are recorded in order — the sequence is the thing under test.
const calls: string[] = [];
const mockAcceptQuote = jest.fn();
const mockCreateIntent = jest.fn();
const mockPresentSheet = jest.fn();
jest.mock('../../../../../src/lib/stripe', () => ({
  acceptQuote: (...a: unknown[]) => {
    calls.push('acceptQuote');
    return mockAcceptQuote(...a);
  },
  createDepositPaymentIntent: (...a: unknown[]) => {
    calls.push('createDepositPaymentIntent');
    return mockCreateIntent(...a);
  },
  presentDepositPaymentSheet: (...a: unknown[]) => {
    calls.push('presentDepositPaymentSheet');
    return mockPresentSheet(...a);
  },
}));

import QuoteApprovalScreen, { parseLineItems } from '../[bookingId]';

const BOOKING = {
  id: 'book-1',
  status: 'pending_customer_approval',
  scheduled_at: '2026-10-14T13:00:00.000Z',
  estimated_duration_mins: 150,
  quoted_total_amount: 175,
  quote_line_items: [
    { label: 'SUV', amount_cents: 3000 },
    { label: 'Heavy pet hair', amount_cents: 2500 },
  ],
  provider_profiles: { users: { full_name: 'Dana Rivers' } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAlert.mockImplementation(() => {});
  calls.length = 0;
  mockGetBookingById.mockResolvedValue({ data: BOOKING, error: null });
  mockAcceptQuote.mockResolvedValue({
    data: { ok: true, next: 'requires_deposit', total_cents: 17500, deposit_cents: 2625 },
    error: null,
  });
  mockCreateIntent.mockResolvedValue({ data: { clientSecret: 'cs_1' }, error: null });
  mockPresentSheet.mockResolvedValue({ data: { canceled: false }, error: null });
});

async function renderAndApprove() {
  const view = render(<QuoteApprovalScreen />);
  await waitFor(() => view.getByText('Approve & Pay Deposit'));
  await act(async () => {
    fireEvent.press(view.getByText('Approve & Pay Deposit'));
  });
  return view;
}

describe('quote approval', () => {
  it('shows the server total, not a recomputed one', async () => {
    const view = render(<QuoteApprovalScreen />);
    await waitFor(() => view.getByTestId('quote-approval-total'));
    expect(view.getByTestId('quote-approval-total').props.children).toContain(
      '175.00',
    );
  });

  it('approves first, then charges — never the other way round', async () => {
    await renderAndApprove();
    expect(calls).toEqual([
      'acceptQuote',
      'createDepositPaymentIntent',
      'presentDepositPaymentSheet',
    ]);
  });

  it('passes the server deposit through untouched', async () => {
    // Not 15% of the total: on a re-quote an already-succeeded deposit is kept
    // as recorded, so recomputing here would collect the wrong balance.
    await renderAndApprove();
    expect(mockCreateIntent).toHaveBeenCalledWith('book-1', 2625);
    // 15% of 17500 would be 2625 by coincidence at first quote — assert the
    // value came from the response by changing it.
    jest.clearAllMocks();
    calls.length = 0;
    mockAcceptQuote.mockResolvedValue({
      data: { ok: true, next: 'requires_deposit', total_cents: 17500, deposit_cents: 999 },
      error: null,
    });
    mockGetBookingById.mockResolvedValue({ data: BOOKING, error: null });
    mockCreateIntent.mockResolvedValue({ data: { clientSecret: 'cs_1' }, error: null });
    mockPresentSheet.mockResolvedValue({ data: { canceled: false }, error: null });
    await renderAndApprove();
    expect(mockCreateIntent).toHaveBeenCalledWith('book-1', 999);
  });

  it('does not charge when approval fails', async () => {
    mockAcceptQuote.mockResolvedValue({
      data: null,
      error: new Error('This quote is no longer awaiting your approval'),
    });
    await renderAndApprove();
    expect(calls).toEqual(['acceptQuote']);
    expect(mockCreateIntent).not.toHaveBeenCalled();
  });

  it('does not charge unless the server names requires_deposit', async () => {
    // The next step is stated by the server, never inferred from ok: true.
    mockAcceptQuote.mockResolvedValue({
      data: { ok: true, next: 'nothing_owed' },
      error: null,
    });
    await renderAndApprove();
    expect(mockCreateIntent).not.toHaveBeenCalled();
  });

  it('does not navigate as if paid when the sheet is dismissed', async () => {
    mockPresentSheet.mockResolvedValue({ data: { canceled: true }, error: null });
    await renderAndApprove();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not navigate as if paid when the sheet errors', async () => {
    mockPresentSheet.mockResolvedValue({
      data: null,
      error: new Error('Card declined'),
    });
    await renderAndApprove();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('refuses to render an approve button for a quote not awaiting approval', async () => {
    mockGetBookingById.mockResolvedValue({
      data: { ...BOOKING, status: 'confirmed' },
      error: null,
    });
    const view = render(<QuoteApprovalScreen />);
    await waitFor(() => view.getByText('This quote is no longer waiting on you.'));
    expect(view.queryByText('Approve & Pay Deposit')).toBeNull();
  });
});

describe('parseLineItems', () => {
  it('reads the stored grammar', () => {
    expect(
      parseLineItems([{ label: 'SUV', amount_cents: 3000 }]),
    ).toEqual([{ label: 'SUV', amount_cents: 3000 }]);
  });

  it('drops malformed entries rather than throwing on the approval screen', () => {
    expect(
      parseLineItems([
        { label: 'ok', amount_cents: 100 },
        { label: 'no amount' },
        { amount_cents: 5 },
        null,
        'nope',
        { label: 'nan', amount_cents: Number.NaN },
      ]),
    ).toEqual([{ label: 'ok', amount_cents: 100 }]);
  });

  it('is empty for a non-array', () => {
    expect(parseLineItems(null)).toEqual([]);
    expect(parseLineItems({})).toEqual([]);
  });
});
