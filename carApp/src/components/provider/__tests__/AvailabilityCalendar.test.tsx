// AvailabilityCalendar.test.tsx — unit tests for the weekly availability picker.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});

import {
  AvailabilityCalendar,
  DEFAULT_AVAILABILITY,
  availabilityFromJson,
} from '../AvailabilityCalendar';

describe('AvailabilityCalendar', () => {
  it('renders all seven days', () => {
    render(<AvailabilityCalendar value={DEFAULT_AVAILABILITY} onChange={jest.fn()} />);
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) =>
      expect(screen.getByText(d)).toBeTruthy(),
    );
  });

  it('toggles a day off when it was on', () => {
    const onChange = jest.fn();
    render(<AvailabilityCalendar value={DEFAULT_AVAILABILITY} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('availability-mon'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_AVAILABILITY, mon: false });
  });

  it('toggles a day on when it was off', () => {
    const onChange = jest.fn();
    render(<AvailabilityCalendar value={DEFAULT_AVAILABILITY} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('availability-sat'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_AVAILABILITY, sat: true });
  });
});

describe('availabilityFromJson', () => {
  it('returns the default week for null / undefined', () => {
    expect(availabilityFromJson(null)).toEqual(DEFAULT_AVAILABILITY);
    expect(availabilityFromJson(undefined)).toEqual(DEFAULT_AVAILABILITY);
  });

  it('returns the default week for non-object values (string, array)', () => {
    expect(availabilityFromJson('mon')).toEqual(DEFAULT_AVAILABILITY);
    expect(availabilityFromJson(['mon', 'tue'])).toEqual(DEFAULT_AVAILABILITY);
  });

  it('round-trips a full stored week', () => {
    const stored = {
      mon: false,
      tue: false,
      wed: true,
      thu: true,
      fri: false,
      sat: true,
      sun: true,
    };
    expect(availabilityFromJson(stored)).toEqual(stored);
  });

  it('fills missing days from the default and ignores non-boolean values', () => {
    // Only weekend keys provided; weekdays should fall back to DEFAULT.
    const result = availabilityFromJson({ sat: true, sun: true, mon: 'yes' });
    expect(result).toEqual({
      ...DEFAULT_AVAILABILITY,
      sat: true,
      sun: true,
    });
    // 'mon' was a non-boolean → falls back to the default (true).
    expect(result.mon).toBe(true);
  });

  // After migration 20260819000000 the real schedule lives in working_hours as
  // per-day windows. This picker must read that shape too, or opening the
  // screen would render a provider's configured 9-5 Monday as "unset" and
  // offer to overwrite it.
  it('reads the working_hours window shape', () => {
    const result = availabilityFromJson({
      mon: [{ start: '09:00', end: '17:00' }],
      tue: [],
      sat: [{ start: '10:00', end: '14:00' }],
    });
    expect(result.mon).toBe(true);
    expect(result.tue).toBe(false);
    expect(result.sat).toBe(true);
    // Absent from the object = closed, which is what the window shape means —
    // note this differs from the boolean map, where absent means "unset".
    expect(result.wed).toBe(false);
  });

  it('treats a day whose only window is corrupt as unavailable', () => {
    const result = availabilityFromJson({
      mon: [{ start: '18:00', end: '09:00' }],
    });
    expect(result.mon).toBe(false);
  });
});
