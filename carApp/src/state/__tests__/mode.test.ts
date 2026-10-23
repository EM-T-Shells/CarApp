// mode.test.ts — unit tests for the active-dashboard-mode store.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  useModeStore,
  selectActiveMode,
  selectIsProviderMode,
} from '../mode';

beforeEach(() => {
  useModeStore.getState().reset();
});

describe('useModeStore', () => {
  it('defaults to the customer dashboard', () => {
    expect(useModeStore.getState().activeMode).toBe('customer');
  });

  it('setActiveMode switches to the provider dashboard', () => {
    useModeStore.getState().setActiveMode('provider');
    expect(useModeStore.getState().activeMode).toBe('provider');
  });

  it('setActiveMode switches back to the customer dashboard', () => {
    useModeStore.getState().setActiveMode('provider');
    useModeStore.getState().setActiveMode('customer');
    expect(useModeStore.getState().activeMode).toBe('customer');
  });

  it('reset restores the customer default', () => {
    useModeStore.getState().setActiveMode('provider');
    useModeStore.getState().reset();
    expect(useModeStore.getState().activeMode).toBe('customer');
  });

  it('selectActiveMode returns the current mode', () => {
    useModeStore.getState().setActiveMode('provider');
    expect(selectActiveMode(useModeStore.getState())).toBe('provider');
  });

  it('selectIsProviderMode reflects provider mode', () => {
    expect(selectIsProviderMode(useModeStore.getState())).toBe(false);
    useModeStore.getState().setActiveMode('provider');
    expect(selectIsProviderMode(useModeStore.getState())).toBe(true);
  });
});
