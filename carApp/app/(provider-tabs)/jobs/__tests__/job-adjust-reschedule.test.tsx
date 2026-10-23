// job-adjust-reschedule.test.tsx — the provider job screen's Phase 3 controls
// on a confirmed booking: proposing an adjustment, withdrawing it, and
// rescheduling by proposal. Supabase and the Edge Function wrappers are mocked.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'book-1' }),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  watchPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

jest.mock('../../../../src/components/provider/JobPhotoCapture', () => ({
  JobPhotoCapture: () => null,
}));

jest.mock('../../../../src/lib/location/tracking', () => ({
  sendProviderLocation: jest.fn(),
}));

jest.mock('../../../../src/components/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="sheet">{children}</View> : null,
  };
});

const mockGetJob = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getProviderJobById: (...a: unknown[]) => mockGetJob(...a),
  getBookingPhotos: jest.fn(async () => ({ data: [], error: null })),
  getThreadByBooking: jest.fn(async () => ({ data: null, error: null })),
}));

jest.mock('../../../../src/lib/supabase/mutations', () => ({
  updateBooking: jest.fn(),
  insertMessageThread: jest.fn(),
}));

const mockAdjust = jest.fn();
const mockWithdraw = jest.fn();
const mockPropose = jest.fn();
const mockRespond = jest.fn();
jest.mock('../../../../src/lib/stripe', () => ({
  captureBalance: jest.fn(),
  acceptBooking: jest.fn(),
  declineBooking: jest.fn(),
  providerCancelBooking: jest.fn(),
  markNoShow: jest.fn(),
  adjustJobDuration: (...a: unknown[]) => mockAdjust(...a),
  withdrawAdjustment: (...a: unknown[]) => mockWithdraw(...a),
  proposeReschedule: (...a: unknown[]) => mockPropose(...a),
  respondReschedule: (...a: unknown[]) => mockRespond(...a),
}));

const USER = { id: 'prov-user' };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: USER }),
}));

import ProviderJobScreen from '../[bookingId]';

const JOB = {
  id: 'book-1',
  customer_id: 'cust-1',
  provider_id: 'prov-1',
  status: 'confirmed',
  scheduled_at: '2026-10-14T13:00:00.000Z',
  total_amount: 255,
  provider_payout: 200,
  estimated_duration_mins: 120,
  suggested_duration_mins: 120,
  approval_expires_at: null,
  proposed_scheduled_at: null,
  reschedule_proposed_by: null,
  adjustment_duration_mins: null,
  adjustment_total_amount: null,
  location_lat: null,
  location_lng: null,
  service_address: '1 Main St',
  notes: null,
  customer: { full_name: 'Casey', avatar_url: null },
  vehicles: null,
  provider_profiles: { users: { id: 'prov-user' } },
};

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function withJob(overrides: Record<string, unknown>) {
  mockGetJob.mockResolvedValue({ data: { ...JOB, ...overrides }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  withJob({});
  for (const m of [mockAdjust, mockWithdraw, mockPropose, mockRespond]) {
    m.mockResolvedValue({ data: { ok: true }, error: null });
  }
});

describe('adjusting a confirmed job', () => {
  it('proposes a longer duration with a reason — never a total', async () => {
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-adjust'));
    fireEvent.press(view.getByTestId('job-adjust'));

    fireEvent.press(view.getByTestId('quote-duration-plus'));
    fireEvent.press(view.getByTestId('quote-duration-plus'));
    fireEvent.changeText(view.getByTestId('adjust-reason'), 'Heavy mud');
    await act(async () => {
      fireEvent.press(view.getByTestId('adjust-send'));
    });

    expect(mockAdjust).toHaveBeenCalledWith({
      bookingId: 'book-1',
      estimatedDurationMins: 150,
      lineItems: [],
      reason: 'Heavy mud',
    });
  });

  it('needs a reason before it can be sent', async () => {
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-adjust'));
    fireEvent.press(view.getByTestId('job-adjust'));
    fireEvent.press(view.getByTestId('adjust-send'));
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('shows a server refusal inline, with the form still open', async () => {
    mockAdjust.mockResolvedValue({
      data: null,
      error: new Error('Change the duration or add a charge to adjust the job'),
    });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-adjust'));
    fireEvent.press(view.getByTestId('job-adjust'));
    fireEvent.changeText(view.getByTestId('adjust-reason'), 'Nothing');
    await act(async () => {
      fireEvent.press(view.getByTestId('adjust-send'));
    });
    expect(view.getByText('Change the duration or add a charge to adjust the job')).toBeTruthy();
  });

  it('withdraws a pending change', async () => {
    withJob({
      status: 'pending_adjustment_approval',
      adjustment_duration_mins: 180,
      adjustment_total_amount: 285,
    });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('adjustment-withdraw'));
    // Nothing to start while the customer decides.
    expect(view.queryByTestId('job-start-travel')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('adjustment-withdraw'));
    });
    expect(mockWithdraw).toHaveBeenCalledWith('book-1');
  });
});

describe('rescheduling by proposal', () => {
  it('opens the proposal sheet', async () => {
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-reschedule'));
    expect(view.queryByTestId('reschedule-submit')).toBeNull();
    fireEvent.press(view.getByTestId('job-reschedule'));
    expect(view.getByTestId('reschedule-submit')).toBeTruthy();
  });

  it('answers the customer’s proposal', async () => {
    withJob({ proposed_scheduled_at: '2026-10-15T13:00:00.000Z', reschedule_proposed_by: 'customer' });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('reschedule-decline'));
    expect(view.queryByTestId('job-reschedule')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('reschedule-decline'));
    });
    expect(mockRespond).toHaveBeenCalledWith('book-1', false);
  });
});
