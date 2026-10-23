import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TimeOffEditor, {
  formatBlockRange,
  wholeDayRange,
} from '../TimeOffEditor';
import type { ProviderTimeOff } from '../../../types/models';

const NY = 'America/New_York';

function block(overrides: Partial<ProviderTimeOff> = {}): ProviderTimeOff {
  return {
    id: 't1',
    provider_id: 'p1',
    starts_at: '2026-09-15T04:00:00.000Z',
    ends_at: '2026-09-16T04:00:00.000Z',
    reason: null,
    created_at: '2026-09-01T00:00:00.000Z',
    blocked_range: null,
    ...overrides,
  } as unknown as ProviderTimeOff;
}

// ── formatBlockRange ──────────────────────────────────────────────────

describe('formatBlockRange', () => {
  // blocked_range is half-open, so a one-day block ends at midnight on the
  // NEXT day. Formatting the raw end instant would read that single Tuesday
  // back to the provider as "Tue – Wed".
  it('reads a one-day block as one day, not two', () => {
    expect(
      formatBlockRange(
        '2026-09-15T04:00:00.000Z',
        '2026-09-16T04:00:00.000Z',
        NY,
      ),
    ).toBe('Tue, Sep 15');
  });

  it('shows both ends of a multi-day block', () => {
    expect(
      formatBlockRange(
        '2026-09-15T04:00:00.000Z',
        '2026-09-18T04:00:00.000Z',
        NY,
      ),
    ).toBe('Tue, Sep 15 – Thu, Sep 17');
  });

  it('formats in the provider zone, not UTC', () => {
    // Midnight Eastern is 04:00Z, so UTC would call this the 16th.
    const range = formatBlockRange(
      '2026-09-16T04:00:00.000Z',
      '2026-09-17T04:00:00.000Z',
      NY,
    );
    expect(range).toBe('Wed, Sep 16');
  });

  it('degrades rather than throwing on an unparseable instant', () => {
    expect(formatBlockRange('nope', '2026-09-16T04:00:00.000Z', NY)).toBe(
      'Invalid dates',
    );
  });
});

// ── wholeDayRange ─────────────────────────────────────────────────────

describe('wholeDayRange', () => {
  it('covers local midnight through the midnight after the last day', () => {
    const range = wholeDayRange(
      new Date('2026-09-15T18:00:00Z'),
      new Date('2026-09-15T18:00:00Z'),
      NY,
    );
    expect(range.startsAt).toBe('2026-09-15T04:00:00.000Z');
    expect(range.endsAt).toBe('2026-09-16T04:00:00.000Z');
  });

  it('spans a multi-day block end to end', () => {
    const range = wholeDayRange(
      new Date('2026-09-15T18:00:00Z'),
      new Date('2026-09-18T18:00:00Z'),
      NY,
    );
    expect(range.startsAt).toBe('2026-09-15T04:00:00.000Z');
    expect(range.endsAt).toBe('2026-09-19T04:00:00.000Z');
  });

  // Adjacent blocks must not collide at the shared midnight, or
  // provider_time_off_no_overlap refuses the second one.
  it('produces adjacent ranges that touch without overlapping', () => {
    const first = wholeDayRange(
      new Date('2026-09-15T18:00:00Z'),
      new Date('2026-09-15T18:00:00Z'),
      NY,
    );
    const second = wholeDayRange(
      new Date('2026-09-16T18:00:00Z'),
      new Date('2026-09-16T18:00:00Z'),
      NY,
    );
    expect(first.endsAt).toBe(second.startsAt);
  });

  it('still covers a whole day across the fall-back boundary', () => {
    // 2026-11-01 is 25 hours long in New York.
    const range = wholeDayRange(
      new Date('2026-11-01T15:00:00Z'),
      new Date('2026-11-01T15:00:00Z'),
      NY,
    );
    const hours =
      (new Date(range.endsAt).getTime() - new Date(range.startsAt).getTime()) /
      3_600_000;
    expect(hours).toBe(25);
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('TimeOffEditor', () => {
  const noop = () => {};

  it('says so when nothing is blocked', () => {
    const { getByText } = render(
      <TimeOffEditor
        blocks={[]}
        timeZone={NY}
        onAdd={noop}
        onRemove={noop}
      />,
    );
    expect(getByText('No time off scheduled.')).toBeTruthy();
  });

  it('lists a block with its range and reason', () => {
    const { getByText } = render(
      <TimeOffEditor
        blocks={[block({ reason: 'Vacation' })]}
        timeZone={NY}
        onAdd={noop}
        onRemove={noop}
      />,
    );
    expect(getByText('Tue, Sep 15')).toBeTruthy();
    expect(getByText('Vacation')).toBeTruthy();
  });

  it('removes a block by id', () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <TimeOffEditor
        blocks={[block()]}
        timeZone={NY}
        onAdd={noop}
        onRemove={onRemove}
      />,
    );

    fireEvent.press(getByLabelText('Remove time off on Tue, Sep 15'));
    expect(onRemove).toHaveBeenCalledWith('t1');
  });

  it('opens the add form and submits a whole-day range', () => {
    const onAdd = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <TimeOffEditor
        blocks={[]}
        timeZone={NY}
        onAdd={onAdd}
        onRemove={noop}
      />,
    );

    fireEvent.press(getByLabelText('Add time off'));
    fireEvent.press(getByTestId('time-off-submit'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const submitted = onAdd.mock.calls[0][0];
    // Whatever today is, the range must be midnight-to-midnight and forward.
    expect(new Date(submitted.endsAt).getTime()).toBeGreaterThan(
      new Date(submitted.startsAt).getTime(),
    );
    expect(submitted.reason).toBeNull();
  });

  it('sends a trimmed reason, and null when it is only whitespace', () => {
    const onAdd = jest.fn();
    const { getByLabelText, getByTestId, getByPlaceholderText } = render(
      <TimeOffEditor blocks={[]} timeZone={NY} onAdd={onAdd} onRemove={noop} />,
    );

    fireEvent.press(getByLabelText('Add time off'));
    fireEvent.changeText(getByPlaceholderText('Vacation'), '  Dentist  ');
    fireEvent.press(getByTestId('time-off-submit'));
    expect(onAdd.mock.calls[0][0].reason).toBe('Dentist');

    fireEvent.press(getByLabelText('Add time off'));
    fireEvent.changeText(getByPlaceholderText('Vacation'), '   ');
    fireEvent.press(getByTestId('time-off-submit'));
    expect(onAdd.mock.calls[1][0].reason).toBeNull();
  });

  it('disables removal while a mutation is in flight', () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <TimeOffEditor
        blocks={[block()]}
        timeZone={NY}
        isBusy
        onAdd={noop}
        onRemove={onRemove}
      />,
    );

    fireEvent.press(getByLabelText('Remove time off on Tue, Sep 15'));
    expect(onRemove).not.toHaveBeenCalled();
  });
});
