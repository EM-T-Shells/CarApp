// manage.test.tsx — unit tests for the provider profile management screen,
// focused on the Phase 1 schedule fields: timezone, working hours, buffers, the
// daily cap and time off.
//
// The save payload is the point of most of these. provider_profiles has a
// column allowlist (migration 20260818120000) and a validation trigger
// (20260819000000), so a payload that names a column outside the grant list is
// a hard 403 and one carrying a bad zone or hours shape is a 22023 — neither of
// which a mocked client would reveal on its own.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetProviderByUserId = jest.fn();
const mockGetProviderTimeOff = jest.fn();

const mockGetServiceDurationModifiers = jest.fn();

jest.mock('../../../../src/lib/supabase/queries', () => ({
  getProviderByUserId: (...args: unknown[]) => mockGetProviderByUserId(...args),
  getProviderTimeOff: (...args: unknown[]) => mockGetProviderTimeOff(...args),
  getServiceDurationModifiers: (...args: unknown[]) =>
    mockGetServiceDurationModifiers(...args),
}));

// mutations.ts constructs the Supabase client at import time, and the tests
// below requireActual it for the real TimeOffOverlapError. Stubbing the client
// module is what lets that import succeed without env vars.
jest.mock('../../../../src/lib/supabase/client', () => ({ supabase: {} }));

const mockUpdateProviderProfile = jest.fn();
const mockInsertProviderTimeOff = jest.fn();
const mockDeleteProviderTimeOff = jest.fn();
const mockUpsertModifier = jest.fn();
const mockDeleteModifier = jest.fn();

jest.mock('../../../../src/lib/supabase/mutations', () => {
  const actual = jest.requireActual('../../../../src/lib/supabase/mutations');
  return {
    updateProviderProfile: (...args: unknown[]) =>
      mockUpdateProviderProfile(...args),
    insertProviderTimeOff: (...args: unknown[]) =>
      mockInsertProviderTimeOff(...args),
    deleteProviderTimeOff: (...args: unknown[]) =>
      mockDeleteProviderTimeOff(...args),
    upsertServiceDurationModifier: (...args: unknown[]) =>
      mockUpsertModifier(...args),
    deleteServiceDurationModifier: (...args: unknown[]) =>
      mockDeleteModifier(...args),
    // The real guard, so the "already blocked" copy is exercised rather than
    // a stub that always agrees.
    isTimeOffOverlapError: actual.isTimeOffOverlapError,
    TimeOffOverlapError: actual.TimeOffOverlapError,
  };
});

// The user object must keep its identity across renders: the screen's load()
// is a useCallback keyed on it, so a fresh object each render re-fires the
// effect forever and the screen never leaves its spinner.
const MOCK_USER = { id: 'user-123' };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: MOCK_USER }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

jest.mock('../../../../src/components/provider/ServiceMenuEditor', () => ({
  ServiceMenuEditor: () => null,
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    Plus: icon('Plus'),
    X: icon('X'),
    Trash2: icon('Trash2'),
    CalendarOff: icon('CalendarOff'),
  };
});

import ProviderManageScreen from '../manage';

const PROFILE = {
  id: 'provider-profile-1',
  bio: 'Ten years detailing.',
  coverage_area: 'Reston',
  mile_radius: 25,
  availability: null,
  working_hours: {
    mon: [{ start: '09:00', end: '17:00' }],
    tue: [{ start: '09:00', end: '17:00' }],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  },
  timezone: 'America/New_York',
  max_jobs_per_day: 3,
  default_buffer_before_mins: 20,
  default_buffer_after_mins: 40,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockGetProviderByUserId.mockResolvedValue({ data: PROFILE, error: null });
  mockGetProviderTimeOff.mockResolvedValue({ data: [], error: null });
  mockUpdateProviderProfile.mockResolvedValue({ data: PROFILE, error: null });
  mockInsertProviderTimeOff.mockResolvedValue({
    data: {
      id: 'to-new',
      provider_id: 'provider-profile-1',
      starts_at: '2026-12-24T05:00:00.000Z',
      ends_at: '2026-12-26T05:00:00.000Z',
      reason: 'Holiday',
    },
    error: null,
  });
  mockDeleteProviderTimeOff.mockResolvedValue({ data: true, error: null });
  mockGetServiceDurationModifiers.mockResolvedValue({ data: [], error: null });
  mockUpsertModifier.mockImplementation((modifier: Record<string, unknown>) =>
    Promise.resolve({ data: { id: 'mod-new', ...modifier }, error: null }),
  );
  mockDeleteModifier.mockResolvedValue({ data: true, error: null });
});

async function renderLoaded() {
  const utils = render(<ProviderManageScreen />);
  await screen.findByText('Public profile');
  return utils;
}

// ── Loading ──────────────────────────────────────────────────────────────────

describe('ProviderManageScreen — loading', () => {
  it('loads the schedule columns into their fields', async () => {
    await renderLoaded();

    expect(screen.getByDisplayValue('20')).toBeTruthy(); // buffer before
    expect(screen.getByDisplayValue('40')).toBeTruthy(); // buffer after
    expect(screen.getByDisplayValue('3')).toBeTruthy(); // daily cap
    // Two days are listed, not collapsed to a range — describeWorkingHours only
    // uses an en dash for runs longer than two.
    expect(screen.getByText('Mon, Tue, 9:00 AM – 5:00 PM')).toBeTruthy();
  });

  it('fetches upcoming time off for the resolved provider', async () => {
    await renderLoaded();

    expect(mockGetProviderTimeOff).toHaveBeenCalledWith(
      'provider-profile-1',
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('falls back to the default zone when the column is blank', async () => {
    mockGetProviderByUserId.mockResolvedValue({
      data: { ...PROFILE, timezone: '' },
      error: null,
    });
    await renderLoaded();

    expect(screen.getByLabelText('Eastern time').props.accessibilityState).toEqual(
      { selected: true },
    );
  });

  // A provider who set real windows must not be shown an unset editor that then
  // overwrites them on save.
  it('reads working hours from the window shape, not the legacy booleans', async () => {
    mockGetProviderByUserId.mockResolvedValue({
      data: {
        ...PROFILE,
        availability: { mon: false, tue: false },
        working_hours: {
          mon: [{ start: '07:00', end: '11:00' }],
          tue: [],
          wed: [],
          thu: [],
          fri: [],
          sat: [],
          sun: [],
        },
      },
      error: null,
    });
    await renderLoaded();

    expect(screen.getByText('Mon, 7:00 AM – 11:00 AM')).toBeTruthy();
  });
});

// ── Saving ───────────────────────────────────────────────────────────────────

describe('ProviderManageScreen — saving', () => {
  it('sends the schedule columns alongside the profile ones', async () => {
    await renderLoaded();

    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());
    const [providerId, payload] = mockUpdateProviderProfile.mock.calls[0];
    expect(providerId).toBe('provider-profile-1');
    expect(payload.timezone).toBe('America/New_York');
    expect(payload.working_hours.mon).toEqual([
      { start: '09:00', end: '17:00' },
    ]);
    expect(payload.max_jobs_per_day).toBe(3);
    expect(payload.default_buffer_before_mins).toBe(20);
    expect(payload.default_buffer_after_mins).toBe(40);
  });

  // Every column outside the 20260818120000 allowlist is a 403, so the payload
  // must never name one — a UPDATE naming platform_fee_rate fails the whole
  // statement, not just that column.
  it('never names a column outside the update allowlist', async () => {
    await renderLoaded();
    fireEvent.press(screen.getByTestId('provider-manage-save'));
    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());

    const allowed = new Set([
      'bio',
      'coverage_area',
      'mile_radius',
      'base_lat',
      'base_lng',
      'availability',
      'default_buffer_before_mins',
      'default_buffer_after_mins',
      'timezone',
      'working_hours',
      'max_jobs_per_day',
    ]);
    const payload = mockUpdateProviderProfile.mock.calls[0][1];
    for (const column of Object.keys(payload)) {
      expect(allowed.has(column)).toBe(true);
    }
  });

  // Both columns exist until the legacy readers migrate. Deriving availability
  // rather than editing it is what stops the two disagreeing.
  it('derives the legacy availability map from the working hours', async () => {
    await renderLoaded();
    fireEvent.press(screen.getByTestId('provider-manage-save'));
    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());

    const payload = mockUpdateProviderProfile.mock.calls[0][1];
    expect(payload.availability.mon).toBe(true);
    expect(payload.availability.wed).toBe(false);
  });

  it('clears the daily cap when the field is emptied rather than saving zero', async () => {
    await renderLoaded();

    fireEvent.changeText(screen.getByDisplayValue('3'), '');
    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());
    expect(mockUpdateProviderProfile.mock.calls[0][1].max_jobs_per_day).toBeNull();
  });

  it('falls back to the default buffer when the field is not a number', async () => {
    await renderLoaded();

    fireEvent.changeText(screen.getByDisplayValue('20'), '');
    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());
    expect(
      mockUpdateProviderProfile.mock.calls[0][1].default_buffer_before_mins,
    ).toBe(15);
  });

  it('clamps an implausible buffer instead of sending it', async () => {
    await renderLoaded();

    fireEvent.changeText(screen.getByDisplayValue('40'), '999');
    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());
    expect(
      mockUpdateProviderProfile.mock.calls[0][1].default_buffer_after_mins,
    ).toBe(480);
  });

  it('saves the selected timezone', async () => {
    await renderLoaded();

    fireEvent.press(screen.getByLabelText('Central time'));
    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() => expect(mockUpdateProviderProfile).toHaveBeenCalled());
    expect(mockUpdateProviderProfile.mock.calls[0][1].timezone).toBe(
      'America/Chicago',
    );
  });

  it('surfaces a save failure', async () => {
    mockUpdateProviderProfile.mockResolvedValue({
      data: null,
      error: new Error('permission denied for table provider_profiles'),
    });
    await renderLoaded();

    fireEvent.press(screen.getByTestId('provider-manage-save'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save',
        'permission denied for table provider_profiles',
      ),
    );
  });
});

// ── Time off ─────────────────────────────────────────────────────────────────

describe('ProviderManageScreen — time off', () => {
  it('adds a block for the resolved provider and lists it', async () => {
    await renderLoaded();

    fireEvent.press(screen.getByLabelText('Add time off'));
    fireEvent.press(screen.getByTestId('time-off-submit'));

    await waitFor(() => expect(mockInsertProviderTimeOff).toHaveBeenCalled());
    expect(mockInsertProviderTimeOff.mock.calls[0][0].provider_id).toBe(
      'provider-profile-1',
    );
    expect(await screen.findByText('Holiday')).toBeTruthy();
  });

  it('removes a block and drops it from the list', async () => {
    mockGetProviderTimeOff.mockResolvedValue({
      data: [
        {
          id: 'to-1',
          provider_id: 'provider-profile-1',
          starts_at: '2026-12-24T05:00:00.000Z',
          ends_at: '2026-12-25T05:00:00.000Z',
          reason: 'Christmas Eve',
        },
      ],
      error: null,
    });
    await renderLoaded();

    expect(screen.getByText('Christmas Eve')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove time off on Thu, Dec 24'));

    await waitFor(() => expect(mockDeleteProviderTimeOff).toHaveBeenCalledWith('to-1'));
    await waitFor(() => expect(screen.queryByText('Christmas Eve')).toBeNull());
  });

  // 23P01 from provider_time_off_no_overlap is the provider colliding with
  // themselves, not a customer taking a slot, so it must not borrow the
  // booking copy.
  it('uses its own copy for an overlapping block', async () => {
    const {
      TimeOffOverlapError,
    } = jest.requireActual('../../../../src/lib/supabase/mutations');
    mockInsertProviderTimeOff.mockResolvedValue({
      data: null,
      error: new TimeOffOverlapError(),
    });
    await renderLoaded();

    fireEvent.press(screen.getByLabelText('Add time off'));
    fireEvent.press(screen.getByTestId('time-off-submit'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Already blocked',
        expect.stringMatching(/already have time off/i),
      ),
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/just taken/i),
    );
  });

  it('reports an ordinary insert failure under a different heading', async () => {
    mockInsertProviderTimeOff.mockResolvedValue({
      data: null,
      error: new Error('network unreachable'),
    });
    await renderLoaded();

    fireEvent.press(screen.getByLabelText('Add time off'));
    fireEvent.press(screen.getByTestId('time-off-submit'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not add time off',
        'network unreachable',
      ),
    );
  });
});

// ── Duration modifiers ───────────────────────────────────────────────────────

describe('ProviderManageScreen — duration modifiers', () => {
  it('loads the provider modifiers', async () => {
    await renderLoaded();
    expect(mockGetServiceDurationModifiers).toHaveBeenCalledWith(
      'provider-profile-1',
    );
  });

  it('upserts a delta on blur', async () => {
    await renderLoaded();

    const field = screen.getByTestId('modifier-size_class:suv');
    fireEvent.changeText(field, '30');
    fireEvent(field, 'blur');

    await waitFor(() => expect(mockUpsertModifier).toHaveBeenCalled());
    expect(mockUpsertModifier).toHaveBeenCalledWith({
      provider_id: 'provider-profile-1',
      factor_type: 'size_class',
      factor_value: 'suv',
      delta_mins: 30,
    });
  });

  it('deletes the row when an existing delta is cleared', async () => {
    mockGetServiceDurationModifiers.mockResolvedValue({
      data: [
        {
          id: 'mod-1',
          provider_id: 'provider-profile-1',
          factor_type: 'size_class',
          factor_value: 'suv',
          delta_mins: 30,
          delta_price: 0,
          created_at: '2026-08-20T00:00:00Z',
        },
      ],
      error: null,
    });
    await renderLoaded();

    const field = screen.getByTestId('modifier-size_class:suv');
    expect(field.props.value).toBe('30');
    fireEvent.changeText(field, '');
    fireEvent(field, 'blur');

    await waitFor(() => expect(mockDeleteModifier).toHaveBeenCalledWith('mod-1'));
  });

  it('surfaces a modifier save failure', async () => {
    mockUpsertModifier.mockResolvedValue({
      data: null,
      error: new Error('violates check constraint'),
    });
    await renderLoaded();

    const field = screen.getByTestId('modifier-soil_level:heavy');
    fireEvent.changeText(field, '45');
    fireEvent(field, 'blur');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save that',
        'violates check constraint',
      ),
    );
  });
});
