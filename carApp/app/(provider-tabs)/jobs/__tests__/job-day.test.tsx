// job-day.test.tsx — the provider job screen's Phase 4 controls: running late,
// the knock-on for later jobs, and the early-finish offer after completing.
// Supabase and the Edge Function wrappers are mocked; the server half is
// supabase/functions/_shared/__tests__/eta.test.ts and verify-job-day.mjs.

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
const mockGetPhotos = jest.fn();
const mockGetDay = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getProviderJobById: (...a: unknown[]) => mockGetJob(...a),
  getBookingPhotos: (...a: unknown[]) => mockGetPhotos(...a),
  getThreadByBooking: jest.fn(async () => ({ data: null, error: null })),
  getProviderDaySchedule: (...a: unknown[]) => mockGetDay(...a),
}));

jest.mock('../../../../src/lib/supabase/mutations', () => ({
  updateBooking: jest.fn(),
  insertMessageThread: jest.fn(),
}));

const mockReportDelay = jest.fn();
const mockPropose = jest.fn();
const mockCapture = jest.fn();
jest.mock('../../../../src/lib/stripe', () => ({
  captureBalance: (...a: unknown[]) => mockCapture(...a),
  acceptBooking: jest.fn(),
  declineBooking: jest.fn(),
  providerCancelBooking: jest.fn(),
  markNoShow: jest.fn(),
  adjustJobDuration: jest.fn(),
  withdrawAdjustment: jest.fn(),
  proposeReschedule: (...a: unknown[]) => mockPropose(...a),
  respondReschedule: jest.fn(),
  reportDelay: (...a: unknown[]) => mockReportDelay(...a),
}));

const USER = { id: 'prov-user' };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: USER }),
}));

import ProviderJobScreen from '../[bookingId]';

const MIN = 60_000;
const inMinutes = (mins: number) => new Date(Date.now() + mins * MIN).toISOString();

// A job starting in an hour: inside the window where a delay can be reported.
const JOB = {
  id: 'book-1',
  customer_id: 'cust-1',
  provider_id: 'prov-1',
  status: 'confirmed',
  scheduled_at: inMinutes(60),
  started_at: null,
  total_amount: 255,
  provider_payout: 200,
  estimated_duration_mins: 120,
  suggested_duration_mins: 120,
  estimated_completion_at: inMinutes(180),
  running_late_mins: 0,
  buffer_before_mins: 15,
  buffer_after_mins: 30,
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

const KNOCK_ON = {
  booking_id: 'b-2',
  customer_name: 'Jane',
  scheduled_at: inMinutes(240),
  projected_start_at: inMinutes(270),
  required_delay_mins: 30,
  current_delay_mins: 0,
};

const PHOTOS = [
  { id: 'p1', photo_type: 'before' },
  { id: 'p2', photo_type: 'before' },
  { id: 'p3', photo_type: 'after' },
  { id: 'p4', photo_type: 'after' },
];

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

type AlertButton = { text: string; onPress?: () => unknown };

function withJob(overrides: Record<string, unknown>) {
  mockGetJob.mockResolvedValue({ data: { ...JOB, ...overrides }, error: null });
}

function nextJob(overrides: Record<string, unknown> = {}) {
  return {
    ...JOB,
    id: 'b-2',
    status: 'confirmed',
    scheduled_at: inMinutes(180),
    started_at: null,
    running_late_mins: 0,
    customer: { full_name: 'Jane', avatar_url: null },
    ...overrides,
  };
}

function withDay(bookings: unknown[]) {
  mockGetDay.mockResolvedValue({
    data: {
      range: { start: inMinutes(-12 * 60), end: inMinutes(12 * 60) },
      timeZone: 'UTC',
      workingHours: {},
      maxJobsPerDay: null,
      defaultBufferBeforeMins: 15,
      defaultBufferAfterMins: 30,
      bookings,
      timeOff: [],
    },
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockImplementation(() => {});
  withJob({});
  mockGetPhotos.mockResolvedValue({ data: [], error: null });
  mockReportDelay.mockResolvedValue({
    data: { ok: true, running_late_mins: 0, notified: true, affected: [] },
    error: null,
  });
  mockPropose.mockResolvedValue({ data: { ok: true }, error: null });
  mockCapture.mockResolvedValue({ data: { ok: true }, error: null });
  withDay([]);
});

describe('running late', () => {
  it('is offered on a job starting today', async () => {
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('running-late-card'));
    expect(view.getByTestId('running-late-title').props.children).toBe('On schedule');
    expect(view.queryByTestId('delay-on-time')).toBeNull();
  });

  it('is not offered on a job days away — that is a new time', async () => {
    withJob({ scheduled_at: inMinutes(3 * 24 * 60) });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-start-travel'));
    expect(view.queryByTestId('running-late-card')).toBeNull();
  });

  it('reports the new total delay, not the step', async () => {
    withJob({ status: 'en_route', running_late_mins: 15 });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('delay-plus-30'));
    expect(view.getByTestId('running-late-title').props.children).toBe('Running 15 min late');
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-plus-30'));
    });
    expect(mockReportDelay).toHaveBeenCalledWith('book-1', 45);
    expect(view.getByTestId('running-late-notice').props.children).toBe('Casey was notified.');
  });

  it('says so when no push was sent', async () => {
    mockReportDelay.mockResolvedValue({
      data: { ok: true, running_late_mins: 15, notified: false, affected: [] },
      error: null,
    });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('delay-plus-15'));
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-plus-15'));
    });
    expect(view.getByTestId('running-late-notice').props.children).toBe(
      'Saved. Casey sees the new time in the app.',
    );
  });

  it('takes the delay back', async () => {
    withJob({ status: 'en_route', running_late_mins: 30 });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('delay-on-time'));
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-minus-15'));
    });
    expect(mockReportDelay).toHaveBeenLastCalledWith('book-1', 15);
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-on-time'));
    });
    expect(mockReportDelay).toHaveBeenLastCalledWith('book-1', 0);
  });

  it('speaks of the finish once the job is under way', async () => {
    withJob({ status: 'in_progress', started_at: inMinutes(-30), running_late_mins: 15 });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('running-late-card'));
    expect(view.getByTestId('running-late-title').props.children).toBe('Running 15 min behind');
    expect(view.getByText('Taking longer than planned?')).toBeTruthy();
  });

  it('shows the server’s refusal', async () => {
    mockReportDelay.mockResolvedValue({ data: null, error: new Error('This job is no longer running') });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('delay-plus-15'));
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-plus-15'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Could not update', 'This job is no longer running');
  });
});

describe('the knock-on for later jobs', () => {
  async function reportWithKnockOn() {
    mockReportDelay.mockResolvedValueOnce({
      data: { ok: true, running_late_mins: 45, notified: true, affected: [KNOCK_ON] },
      error: null,
    });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('delay-plus-30'));
    await act(async () => {
      fireEvent.press(view.getByTestId('delay-plus-30'));
    });
    await waitFor(() => view.getByTestId('knock-on-b-2'));
    return view;
  }

  it('lists the later job the delay reaches', async () => {
    const view = await reportWithKnockOn();
    expect(view.getByText(/about 30 min late\. They don’t know yet\./)).toBeTruthy();
  });

  it('tells that customer (shift)', async () => {
    const view = await reportWithKnockOn();
    await act(async () => {
      fireEvent.press(view.getByTestId('knock-on-tell-b-2'));
    });
    expect(mockReportDelay).toHaveBeenLastCalledWith('b-2', 30);
    expect(view.queryByTestId('knock-on-b-2')).toBeNull();
  });

  it('proposes them a new time (reschedule)', async () => {
    const view = await reportWithKnockOn();
    expect(view.queryByTestId('reschedule-submit')).toBeNull();
    fireEvent.press(view.getByTestId('knock-on-propose-b-2'));
    expect(view.getByTestId('reschedule-submit')).toBeTruthy();
    expect(view.getByText(/until Jane accepts the new time/)).toBeTruthy();
  });

  it('leaves it, telling nobody (shorten)', async () => {
    const view = await reportWithKnockOn();
    fireEvent.press(view.getByTestId('knock-on-leave-b-2'));
    expect(view.queryByTestId('knock-on-b-2')).toBeNull();
    expect(mockReportDelay).toHaveBeenCalledTimes(1);
  });
});

describe('finishing early', () => {
  async function complete(): Promise<void> {
    withJob({
      status: 'in_progress',
      started_at: inMinutes(-60),
      scheduled_at: inMinutes(-60),
    });
    mockGetPhotos.mockResolvedValue({ data: PHOTOS, error: null });
    const view = render(<ProviderJobScreen />);
    await waitFor(() => view.getByTestId('job-complete'));
    fireEvent.press(view.getByTestId('job-complete'));
    const confirm = alertSpy.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      await confirm.find((b) => b.text === 'Complete Job')!.onPress!();
    });
  }

  function lastAlert(): { title: string; message: string; buttons: AlertButton[] } {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    return {
      title: call[0] as string,
      message: (call[1] as string) ?? '',
      buttons: (call[2] as AlertButton[]) ?? [],
    };
  }

  it('offers the next customer an earlier start when there is room', async () => {
    withDay([nextJob()]);
    await complete();
    expect(mockCapture).toHaveBeenCalledWith('book-1');

    const alert = lastAlert();
    expect(alert.title).toBe('Job complete — you finished early');
    expect(alert.message).toMatch(/Jane is booked for .+\. Offer to start at .+ instead\?/);
    const offer = alert.buttons.find((b) => b.text.startsWith('Offer '))!;
    await act(async () => {
      await offer.onPress!();
    });
    // now + 30 min after-buffer + 15 min before-buffer, on a five-minute mark.
    const [bookingId, startAt] = mockPropose.mock.calls[0] as [string, string];
    expect(bookingId).toBe('b-2');
    const gain = new Date(nextJob().scheduled_at).getTime() - new Date(startAt).getTime();
    expect(gain).toBeGreaterThanOrEqual(15 * MIN);
    expect(new Date(startAt).getUTCMinutes() % 5).toBe(0);
  });

  it('corrects a delay the next customer no longer faces', async () => {
    withDay([nextJob({ running_late_mins: 30 })]);
    await complete();
    const alert = lastAlert();
    expect(alert.title).toBe('Job complete');
    expect(alert.message).toMatch(/Jane was told you’d be 30 min late .+ You’re on time now/);
    await act(async () => {
      await alert.buttons.find((b) => b.text === 'Update them')!.onPress!();
    });
    expect(mockReportDelay).toHaveBeenCalledWith('b-2', 0);
  });

  it('just confirms the completion when nothing follows today', async () => {
    withDay([]);
    await complete();
    expect(lastAlert()).toEqual({
      title: 'Job complete',
      message: 'Payment captured and your payout is queued.',
      buttons: [],
    });
    expect(mockPropose).not.toHaveBeenCalled();
  });
});
