// SearchOverlay.test.tsx — unit tests for the results-screen search panel.
// Covers the Where/When fields, the Search and dismiss actions, the date
// summary, and confirms the removed "Driver Age" control is absent. The date
// picker, LocationSearchBar, icons, and safe-area insets are mocked.

import React from 'react';
import {
  render,
  screen,
  fireEvent,
} from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

// LocationSearchBar has its own tests — stub it to its placeholder.
jest.mock('../LocationSearchBar', () => {
  const { Text } = require('react-native');
  return {
    LocationSearchBar: ({ placeholder }: { placeholder: string }) => (
      <Text>{placeholder}</Text>
    ),
  };
});

// Record the props the native date picker is mounted with, and expose a way to
// fire its onChange from a test.
let lastPickerProps: Record<string, unknown> | null = null;
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      lastPickerProps = props;
      return <View testID="date-picker" />;
    },
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    ArrowLeft: icon('ArrowLeft'),
    Calendar: icon('Calendar'),
  };
});

import { SearchOverlay } from '../SearchOverlay';

const noop = () => undefined;

beforeEach(() => {
  jest.clearAllMocks();
  lastPickerProps = null;
});

describe('SearchOverlay', () => {
  it('renders Where and When fields with a Search action', () => {
    render(
      <SearchOverlay
        visible
        onClose={noop}
        onSubmit={noop}
        serviceDate={null}
        onChangeDate={noop}
      />,
    );

    expect(screen.getByText('Where')).toBeTruthy();
    expect(screen.getByText('When')).toBeTruthy();
    expect(screen.getByText('Add dates or months')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });

  it('does not render a Driver Age control', () => {
    render(
      <SearchOverlay
        visible
        onClose={noop}
        onSubmit={noop}
        serviceDate={null}
        onChangeDate={noop}
      />,
    );

    expect(screen.queryByText('Driver Age')).toBeNull();
  });

  it('calls onSubmit when Search is pressed', () => {
    const onSubmit = jest.fn();
    render(
      <SearchOverlay
        visible
        onClose={noop}
        onSubmit={onSubmit}
        serviceDate={null}
        onChangeDate={noop}
      />,
    );

    fireEvent.press(screen.getByText('Search'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('dismisses via the back arrow', () => {
    const onClose = jest.fn();
    render(
      <SearchOverlay
        visible
        onClose={onClose}
        onSubmit={noop}
        serviceDate={null}
        onChangeDate={noop}
      />,
    );

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the formatted date once one is selected', () => {
    render(
      <SearchOverlay
        visible
        onClose={noop}
        onSubmit={noop}
        serviceDate={new Date('2026-08-07T12:00:00Z')}
        onChangeDate={noop}
      />,
    );

    expect(screen.getByText('Aug 7, 2026')).toBeTruthy();
    expect(screen.queryByText('Add dates or months')).toBeNull();
  });

  it('opens the date picker and reports a chosen date', () => {
    const onChangeDate = jest.fn();
    render(
      <SearchOverlay
        visible
        onClose={noop}
        onSubmit={noop}
        serviceDate={null}
        onChangeDate={onChangeDate}
      />,
    );

    fireEvent.press(screen.getByText('Add dates or months'));
    expect(screen.getByTestId('date-picker')).toBeTruthy();

    const picked = new Date('2026-08-07T12:00:00Z');
    (lastPickerProps?.onChange as (e: unknown, d?: Date) => void)(
      { type: 'set' },
      picked,
    );
    expect(onChangeDate).toHaveBeenCalledWith(picked);
  });
});
