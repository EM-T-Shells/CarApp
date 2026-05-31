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
