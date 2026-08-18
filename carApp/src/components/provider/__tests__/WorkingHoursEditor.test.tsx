import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WorkingHoursEditor, {
  addWindow,
  removeWindow,
  setDayOpen,
  setWindowEdge,
} from '../WorkingHoursEditor';
import {
  DEFAULT_WORKING_HOURS,
  workingHoursFromJson,
  type WorkingHours,
} from '../../../utils/schedule';

const HOURS: WorkingHours = workingHoursFromJson({
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [],
});

// ── Pure edit operations ──────────────────────────────────────────────

describe('setDayOpen', () => {
  it('opens a closed day with the default window', () => {
    expect(setDayOpen(HOURS, 'tue', true).tue).toEqual([
      { start: '08:00', end: '18:00' },
    ]);
  });

  it('closes a day by emptying its windows', () => {
    expect(setDayOpen(HOURS, 'mon', false).mon).toEqual([]);
  });

  it('does not mutate the value it was given', () => {
    setDayOpen(HOURS, 'mon', false);
    expect(HOURS.mon).toHaveLength(1);
  });
});

describe('addWindow', () => {
  // A second window that opens before the first closes is a merge, not a split.
  it('starts the new window an hour after the last one closes', () => {
    const next = addWindow(HOURS, 'mon');
    expect(next.mon).toHaveLength(2);
    expect(next.mon[1]).toEqual({ start: '18:00', end: '20:00' });
  });

  it('opens a closed day rather than producing a stray window', () => {
    expect(addWindow(HOURS, 'tue').tue).toEqual([{ start: '08:00', end: '18:00' }]);
  });

  it('stays inside the day when the last window ends late', () => {
    const late = workingHoursFromJson({ mon: [{ start: '20:00', end: '23:00' }] });
    const next = addWindow(late, 'mon');
    for (const window of next.mon) {
      expect(window.start < window.end).toBe(true);
      expect(window.end <= '23:59').toBe(true);
    }
  });
});

describe('removeWindow', () => {
  it('drops the window at the given index', () => {
    const two = addWindow(HOURS, 'mon');
    expect(removeWindow(two, 'mon', 0).mon).toEqual([
      { start: '18:00', end: '20:00' },
    ]);
  });
});

describe('setWindowEdge', () => {
  it('moves the requested edge', () => {
    expect(setWindowEdge(HOURS, 'mon', 0, 'start', 7 * 60 + 30).mon[0]).toEqual({
      start: '07:30',
      end: '17:00',
    });
  });

  // Rejecting the input would leave the picker showing a time the value does
  // not have, so the other edge moves instead.
  it('pushes the end when a start is dragged past it', () => {
    const next = setWindowEdge(HOURS, 'mon', 0, 'start', 18 * 60);
    expect(next.mon[0]).toEqual({ start: '18:00', end: '18:15' });
  });

  it('pushes the start when an end is dragged before it', () => {
    const next = setWindowEdge(HOURS, 'mon', 0, 'end', 8 * 60);
    expect(next.mon[0]).toEqual({ start: '07:45', end: '08:00' });
  });

  it('clamps to the day rather than wrapping past midnight', () => {
    const next = setWindowEdge(HOURS, 'mon', 0, 'start', 25 * 60);
    expect(next.mon[0].start <= '23:45').toBe(true);
    expect(next.mon[0].start < next.mon[0].end).toBe(true);
  });

  it('ignores an index that does not exist', () => {
    expect(setWindowEdge(HOURS, 'mon', 9, 'start', 600)).toEqual(HOURS);
  });

  // Every window the editor can produce must survive the database trigger,
  // which refuses end <= start.
  it('never produces a window the database would refuse', () => {
    let hours = DEFAULT_WORKING_HOURS;
    for (const minutes of [0, 15, 600, 1439, 1440, -60]) {
      hours = setWindowEdge(hours, 'mon', 0, 'start', minutes);
      expect(hours.mon[0].start < hours.mon[0].end).toBe(true);
      hours = setWindowEdge(hours, 'mon', 0, 'end', minutes);
      expect(hours.mon[0].start < hours.mon[0].end).toBe(true);
    }
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('WorkingHoursEditor', () => {
  it('renders every day with its state', () => {
    const { getByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={jest.fn()} />,
    );
    expect(getByLabelText('Mon, working')).toBeTruthy();
    expect(getByLabelText('Tue, closed')).toBeTruthy();
  });

  it('shows the window times as 12-hour labels', () => {
    const { getByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={jest.fn()} />,
    );
    expect(getByLabelText('Mon window 1 start, 9:00 AM')).toBeTruthy();
    expect(getByLabelText('Mon window 1 end, 5:00 PM')).toBeTruthy();
  });

  it('toggles a day off through onChange', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('Mon, working'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mon: [] }),
    );
  });

  it('adds a second window through onChange', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('Add another window on Mon'));
    expect(onChange.mock.calls[0][0].mon).toHaveLength(2);
  });

  // The remove control only appears once there is something to fall back to,
  // so a day can never be left with a phantom empty window.
  it('offers no remove control for a lone window', () => {
    const { queryByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={jest.fn()} />,
    );
    expect(queryByLabelText('Remove Mon window 1')).toBeNull();
  });

  it('offers remove controls once a day has two windows', () => {
    const { getByLabelText } = render(
      <WorkingHoursEditor value={addWindow(HOURS, 'mon')} onChange={jest.fn()} />,
    );
    expect(getByLabelText('Remove Mon window 1')).toBeTruthy();
    expect(getByLabelText('Remove Mon window 2')).toBeTruthy();
  });

  it('gives every control a 44pt touch target', () => {
    const { getByLabelText } = render(
      <WorkingHoursEditor value={HOURS} onChange={jest.fn()} />,
    );
    for (const label of ['Mon, working', 'Mon window 1 start, 9:00 AM']) {
      const style = StyleSheet_flatten(getByLabelText(label).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

// Local helper: RN's StyleSheet.flatten typed loosely for the assertion above.
function StyleSheet_flatten(style: unknown): { minHeight?: number } {
  const list = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...list.filter(Boolean));
}
