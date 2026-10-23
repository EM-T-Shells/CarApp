import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArrivalWindowPicker, {
  ARRIVAL_WINDOW_PRESETS,
  buildArrivalWindow,
  presetForWindow,
} from '../ArrivalWindowPicker';

const noop = () => {};

// Jest pins TZ=UTC via jest.globalSetup.js, so local hours are UTC hours here
// and the exact instants below are assertable.
const DAY = new Date('2026-10-14T00:00:00.000Z');

function setup(
  overrides: Partial<React.ComponentProps<typeof ArrivalWindowPicker>> = {},
) {
  const props = {
    value: null,
    onChange: noop,
    minimumDate: DAY,
    ...overrides,
  };
  return { ...render(<ArrivalWindowPicker {...props} />), props };
}

describe('ArrivalWindowPicker', () => {
  it('offers every preset window', () => {
    const { getByTestId } = setup();
    for (const preset of ARRIVAL_WINDOW_PRESETS) {
      expect(getByTestId(`arrival-window-${preset.id}`)).toBeTruthy();
    }
  });

  it('emits both ends of the window when a preset is chosen', () => {
    const onChange = jest.fn();
    const { getByTestId } = setup({ onChange });

    fireEvent.press(getByTestId('arrival-window-afternoon'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const window = onChange.mock.calls[0][0];
    expect(window.start).toBe('2026-10-14T12:00:00.000Z');
    expect(window.end).toBe('2026-10-14T16:00:00.000Z');
  });

  it('never emits a window whose end is not after its start', () => {
    // bookings_requested_window_check rejects end <= start with a 23514, which
    // would surface at insert rather than here. Presets make it unreachable.
    const onChange = jest.fn();
    const { getByTestId } = setup({ onChange });

    for (const preset of ARRIVAL_WINDOW_PRESETS) {
      fireEvent.press(getByTestId(`arrival-window-${preset.id}`));
    }

    expect(onChange).toHaveBeenCalledTimes(ARRIVAL_WINDOW_PRESETS.length);
    for (const [window] of onChange.mock.calls) {
      expect(new Date(window.end).getTime()).toBeGreaterThan(
        new Date(window.start).getTime(),
      );
    }
  });

  it('marks the preset matching the current value as selected', () => {
    const value = buildArrivalWindow(DAY, ARRIVAL_WINDOW_PRESETS[0]);
    const { getByTestId } = setup({ value });

    const selected = getByTestId('arrival-window-morning');
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(
      getByTestId('arrival-window-evening').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('explains that the provider picks the exact start', () => {
    // The window is a preference, not an appointment. Saying so on the screen
    // is what stops it reading as "nobody knows when they are coming".
    const { getByText } = setup();
    expect(
      getByText(/provider picks an exact start time inside this window/i),
    ).toBeTruthy();
  });

  it('renders the day even before a window is chosen', () => {
    const { getByTestId } = setup();
    expect(getByTestId('arrival-window-day')).toBeTruthy();
  });
});

describe('buildArrivalWindow', () => {
  it('resolves preset hours against the given day', () => {
    const window = buildArrivalWindow(DAY, {
      id: 'custom',
      label: 'Custom',
      startHour: 9,
      endHour: 17,
    });
    expect(window.start).toBe('2026-10-14T09:00:00.000Z');
    expect(window.end).toBe('2026-10-14T17:00:00.000Z');
  });

  it('zeroes minutes, seconds and milliseconds', () => {
    // The day carried in can be any instant — "now" when nothing is selected
    // yet. Only its calendar date should survive into the window.
    const messy = new Date('2026-10-14T13:47:23.456Z');
    const window = buildArrivalWindow(messy, ARRIVAL_WINDOW_PRESETS[0]);
    expect(window.start).toBe('2026-10-14T08:00:00.000Z');
  });
});

describe('presetForWindow', () => {
  it('round-trips a window it built', () => {
    for (const preset of ARRIVAL_WINDOW_PRESETS) {
      const window = buildArrivalWindow(DAY, preset);
      expect(presetForWindow(window)).toBe(preset.id);
    }
  });

  it('returns null for a window matching no preset', () => {
    expect(
      presetForWindow({
        start: '2026-10-14T09:30:00.000Z',
        end: '2026-10-14T11:30:00.000Z',
      }),
    ).toBeNull();
  });

  it('returns null for null and for unparseable input', () => {
    expect(presetForWindow(null)).toBeNull();
    expect(presetForWindow({ start: 'not-a-date', end: 'nope' })).toBeNull();
  });
});
