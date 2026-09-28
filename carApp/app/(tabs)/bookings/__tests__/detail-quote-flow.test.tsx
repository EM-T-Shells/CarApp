// detail-quote-flow.test.tsx — the customer booking screen's Phase 3 controls.
//
// Every action here is a server call (the Stripe-module wrappers), so these
// assert which call a button makes and with what, not that the server obeys.
// Supabase is mocked like every Jest suite here.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'book-1' }),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../../../../src/components/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="sheet">{children}</View> : null,
  };
});

const mockUploadIntake = jest.fn();
jest.mock('../../../../src/components/booking/IntakePhotoUploader', () => {
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onAdd }: { onAdd: (p: unknown) => void }) => (
      <Pressable testID="intake-add-photo" onPress={() => onAdd({ uri: 'file:///p.jpg', mimeType: 'image/jpeg', fileSize: 1 })}>
        <Text>add</Text>
      </Pressable>
    ),
    uploadIntakePhoto: (...a: unknown[]) => mockUploadIntake(...a),
  };
});

const mockGetBooking = jest.fn();
const mockGetPhotos = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getBookingById: (...a: unknown[]) => mockGetBooking(...a),
  getBookingPhotos: (...a: unknown[]) => mockGetPhotos(...a),
  getRatingByBooking: jest.fn(async () => ({ data: null, error: null })),
  getThreadByBooking: jest.fn(async () => ({ data: null, error: null })),
}));

const mockUpdateBooking = jest.fn();
jest.mock('../../../../src/lib/supabase/mutations', () => ({
  updateBooking: (...a: unknown[]) => mockUpdateBooking(...a),
  updateRating: jest.fn(),
  insertRating: jest.fn(),
  insertKudos: jest.fn(),
  insertMessageThread: jest.fn(),
}));

const mockCancel = jest.fn();
const mockPropose = jest.fn();
const mockProvideInfo = jest.fn();
const mockRespondAdjustment = jest.fn();
const mockRespondReschedule = jest.fn();
jest.mock('../../../../src/lib/stripe', () => ({
  cancelBooking: (...a: unknown[]) => mockCancel(...a),
  proposeReschedule: (...a: unknown[]) => mockPropose(...a),
  provideCustomerInfo: (...a: unknown[]) => mockProvideInfo(...a),
  respondAdjustment: (...a: unknown[]) => mockRespondAdjustment(...a),
  respondReschedule: (...a: unknown[]) => mockRespondReschedule(...a),
}));

const USER = { id: 'cust-1' };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: USER }),
}));

import BookingDetailScreen from '../[id]';

const BASE = {
  id: 'book-1',
  customer_id: 'cust-1',
  provider_id: 'prov-1',
  status: 'confirmed',
  scheduled_at: '2026-10-14T13:00:00.000Z',
  services: [],
  total_amount: 255,
  deposit_amount: 38.25,
  service_fee: 5,
  estimated_duration_mins: 120,
  quoted_total_amount: 255,
  quote_line_items: [],
  requested_window_start: '2026-10-14T12:00:00.000Z',
  requested_window_end: '2026-10-14T16:00:00.000Z',
  info_request_note: null,
  proposed_scheduled_at: null,
  reschedule_proposed_by: null,
  adjustment_duration_mins: null,
  adjustment_line_items: null,
  adjustment_total_amount: null,
  adjustment_reason: null,
  provider_profiles: { users: { id: 'prov-user', full_name: 'Dana Rivers', avatar_url: null } },
  vehicles: null,
};

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function withBooking(overrides: Record<string, unknown>) {
  mockGetBooking.mockResolvedValue({ data: { ...BASE, ...overrides }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockImplementation(() => {});
  withBooking({});
  mockGetPhotos.mockResolvedValue({ data: [], error: null });
  for (const m of [mockCancel, mockPropose, mockProvideInfo, mockRespondAdjustment, mockRespondReschedule]) {
    m.mockResolvedValue({ data: { ok: true }, error: null });
  }
});

describe('reschedule, by proposal', () => {
  // The direct scheduled_at write was revoked in 20260822000000.
  it('proposes a new time instead of writing the booking', async () => {
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByText('Reschedule'));
    fireEvent.press(view.getByText('Reschedule'));
    expect(view.getByTestId('sheet')).toBeTruthy();
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  it('answers the provider’s proposal', async () => {
    withBooking({ proposed_scheduled_at: '2026-10-15T13:00:00.000Z', reschedule_proposed_by: 'provider' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('reschedule-accept'));
    // No second proposal while one is open.
    expect(view.queryByText('Reschedule')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('reschedule-accept'));
    });
    expect(mockRespondReschedule).toHaveBeenCalledWith('book-1', true);
  });

  it('withdraws their own proposal', async () => {
    withBooking({ proposed_scheduled_at: '2026-10-15T13:00:00.000Z', reschedule_proposed_by: 'customer' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('reschedule-withdraw'));
    expect(view.queryByTestId('reschedule-accept')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('reschedule-withdraw'));
    });
    expect(mockRespondReschedule).toHaveBeenCalledWith('book-1', false);
  });
});

describe('a proposed adjustment', () => {
  const ADJUSTING = {
    status: 'pending_adjustment_approval',
    adjustment_duration_mins: 180,
    adjustment_total_amount: 285,
    adjustment_line_items: [{ label: 'Heavy mud', amount_cents: 3000 }],
    adjustment_reason: 'Mud throughout',
  };

  it('shows the server total and approves through the server', async () => {
    withBooking(ADJUSTING);
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('adjustment-new-total'));
    expect(view.getByTestId('adjustment-new-total').props.children).toBe('$285.00');
    await act(async () => {
      fireEvent.press(view.getByTestId('adjustment-approve'));
    });
    expect(mockRespondAdjustment).toHaveBeenCalledWith('book-1', true);
  });

  it('confirms before declining, because declining cancels', async () => {
    withBooking(ADJUSTING);
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('adjustment-decline'));
    fireEvent.press(view.getByTestId('adjustment-decline'));
    expect(mockRespondAdjustment).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Decline & Cancel')!.onPress!();
    });
    expect(mockRespondAdjustment).toHaveBeenCalledWith('book-1', false);
  });
});

describe('a request sent back for more information', () => {
  it('shows what the provider asked for and hands the request back', async () => {
    withBooking({ status: 'awaiting_customer_info', info_request_note: 'Back seats please' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('info-request-note'));
    expect(view.getByText('“Back seats please”')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('send-back-to-provider'));
    });
    expect(mockProvideInfo).toHaveBeenCalledWith('book-1');
  });

  it('uploads an added photo to the request', async () => {
    withBooking({ status: 'awaiting_customer_info' });
    mockUploadIntake.mockResolvedValue({ data: { id: 'ph1' }, error: null });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByTestId('intake-add-photo'));
    await act(async () => {
      fireEvent.press(view.getByTestId('intake-add-photo'));
    });
    expect(mockUploadIntake).toHaveBeenCalledWith('book-1', expect.objectContaining({ uri: 'file:///p.jpg' }));
  });
});

describe('cancelling an unpriced request', () => {
  it('is offered, and says nothing has been charged', async () => {
    withBooking({ status: 'pending_provider_quote' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByText('Cancel Request'));
    fireEvent.press(view.getByText('Cancel Request'));
    expect(view.getByText('Nothing has been charged, so cancelling this request is free.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Confirm Cancellation'));
    });
    expect(mockCancel).toHaveBeenCalledWith('book-1');
  });

  // Its deposit_amount is derived from the advertised price, not what the
  // quote will charge, so it is not shown as a deposit.
  it('hides the deposit summary', async () => {
    withBooking({ status: 'pending_provider_quote' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByText('Waiting for your price'));
    expect(view.queryByText(/deposit/i)).toBeNull();
  });
});

describe('an approved quote-first booking', () => {
  it('says the deposit is processing rather than paid', async () => {
    withBooking({ status: 'pending' });
    const view = render(<BookingDetailScreen />);
    await waitFor(() => view.getByText('Deposit processing'));
  });
});
