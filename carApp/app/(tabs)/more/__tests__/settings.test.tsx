// settings.test.tsx — unit tests for the Settings screen notification toggles.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}));

import { useSettingsStore } from '../../../../src/state/settings';
import SettingsScreen from '../settings';

beforeEach(() => {
  useSettingsStore.getState().reset();
});

describe('SettingsScreen', () => {
  it('renders all notification rows', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Booking updates')).toBeTruthy();
    expect(screen.getByText('Provider en route')).toBeTruthy();
    expect(screen.getByText('New messages')).toBeTruthy();
    expect(screen.getByText('Promotions & offers')).toBeTruthy();
  });

  it('reflects the store value on each switch', () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId('settings-toggle-bookingUpdates').props.value).toBe(
      true,
    );
    expect(screen.getByTestId('settings-toggle-promotions').props.value).toBe(
      false,
    );
  });

  it('toggling a switch updates the store', () => {
    render(<SettingsScreen />);
    fireEvent(
      screen.getByTestId('settings-toggle-promotions'),
      'valueChange',
      true,
    );
    expect(useSettingsStore.getState().notifications.promotions).toBe(true);
  });

  it('renders the app version from expo config', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('1.2.3')).toBeTruthy();
  });
});
