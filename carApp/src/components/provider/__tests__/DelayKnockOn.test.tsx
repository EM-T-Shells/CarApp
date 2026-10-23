// DelayKnockOn — the later jobs a delay reaches, and the three choices for each.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DelayKnockOn, { describeKnockOn } from '../DelayKnockOn';

// Jest pins TZ=UTC, so 18:00Z reads as 6:00 PM.
const ENTRY = {
  booking_id: 'b-2',
  customer_name: 'Jane',
  scheduled_at: '2031-12-01T18:00:00.000Z',
  projected_start_at: '2031-12-01T18:30:00.000Z',
  required_delay_mins: 30,
  current_delay_mins: 0,
};

describe('describeKnockOn', () => {
  it('a later start the customer has not heard about', () => {
    expect(describeKnockOn(ENTRY)).toBe(
      'Can now start around 6:30 PM, about 30 min late. They don’t know yet.',
    );
  });

  it('a later start than the customer was told', () => {
    expect(describeKnockOn({ ...ENTRY, required_delay_mins: 45, current_delay_mins: 15 })).toMatch(
      /about 45 min late\. They were told 15 min\.$/,
    );
  });

  it('back on time', () => {
    expect(describeKnockOn({ ...ENTRY, required_delay_mins: 0, current_delay_mins: 30 })).toBe(
      'Back on time. They were told you’d be 30 min late.',
    );
  });

  it('less late than the customer was told', () => {
    expect(describeKnockOn({ ...ENTRY, required_delay_mins: 15, current_delay_mins: 30 })).toBe(
      'Now about 15 min late. They were told 30 min.',
    );
  });
});

describe('DelayKnockOn', () => {
  const handlers = () => ({ onTell: jest.fn(), onPropose: jest.fn(), onLeave: jest.fn() });

  it('renders nothing with nothing affected', () => {
    const view = render(<DelayKnockOn entries={[]} {...handlers()} />);
    expect(view.queryByTestId('delay-knock-on')).toBeNull();
  });

  it('offers all three choices for a later start', () => {
    const h = handlers();
    const view = render(<DelayKnockOn entries={[ENTRY]} {...h} />);
    fireEvent.press(view.getByTestId('knock-on-tell-b-2'));
    fireEvent.press(view.getByTestId('knock-on-propose-b-2'));
    fireEvent.press(view.getByTestId('knock-on-leave-b-2'));
    expect(h.onTell).toHaveBeenCalledWith(ENTRY);
    expect(h.onPropose).toHaveBeenCalledWith(ENTRY);
    expect(h.onLeave).toHaveBeenCalledWith(ENTRY);
    expect(view.getByText('Let them know')).toBeTruthy();
  });

  it('has no new time to propose when the job is back on time', () => {
    const view = render(
      <DelayKnockOn
        entries={[{ ...ENTRY, required_delay_mins: 0, current_delay_mins: 30 }]}
        {...handlers()}
      />,
    );
    expect(view.queryByTestId('knock-on-propose-b-2')).toBeNull();
    expect(view.getByText('Update them')).toBeTruthy();
  });

  it('names nobody rather than "null"', () => {
    const view = render(<DelayKnockOn entries={[{ ...ENTRY, customer_name: null }]} {...handlers()} />);
    expect(view.getByText(/^Your next customer · /)).toBeTruthy();
  });
});
