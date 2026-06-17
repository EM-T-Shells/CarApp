// settings.test.ts — unit tests for the notification-preferences store.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  useSettingsStore,
  selectNotifications,
} from '../settings';

beforeEach(() => {
  useSettingsStore.getState().reset();
});

describe('useSettingsStore', () => {
  it('defaults marketing off and transactional categories on', () => {
    const { notifications } = useSettingsStore.getState();
    expect(notifications.bookingUpdates).toBe(true);
    expect(notifications.providerEnRoute).toBe(true);
    expect(notifications.messages).toBe(true);
    expect(notifications.promotions).toBe(false);
  });

  it('toggleNotification flips a single category without touching others', () => {
    useSettingsStore.getState().toggleNotification('promotions');
    expect(useSettingsStore.getState().notifications.promotions).toBe(true);
    expect(useSettingsStore.getState().notifications.bookingUpdates).toBe(true);

    useSettingsStore.getState().toggleNotification('bookingUpdates');
    expect(useSettingsStore.getState().notifications.bookingUpdates).toBe(false);
    // promotions stays where the previous toggle left it
    expect(useSettingsStore.getState().notifications.promotions).toBe(true);
  });

  it('setNotifications merges a partial patch', () => {
    useSettingsStore.getState().setNotifications({ messages: false });
    expect(useSettingsStore.getState().notifications.messages).toBe(false);
    expect(useSettingsStore.getState().notifications.bookingUpdates).toBe(true);
  });

  it('reset restores defaults', () => {
    useSettingsStore.getState().setNotifications({
      bookingUpdates: false,
      promotions: true,
    });
    useSettingsStore.getState().reset();
    const { notifications } = useSettingsStore.getState();
    expect(notifications.bookingUpdates).toBe(true);
    expect(notifications.promotions).toBe(false);
  });

  it('selectNotifications returns the notifications slice', () => {
    const state = useSettingsStore.getState();
    expect(selectNotifications(state)).toBe(state.notifications);
  });
});
