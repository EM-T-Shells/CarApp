// TabsLayout.test.tsx — unit tests for the 5-tab bottom navigation layout.

import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock expo-router Tabs to capture what screens are registered.
const mockTabsScreen = jest.fn((_props: Record<string, unknown>) => null);
function MockTabs({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}
MockTabs.Screen = mockTabsScreen;

jest.mock('expo-router', () => ({
  Tabs: MockTabs,
}));

// Mock lucide icons — render a simple View with testID.
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    Search: icon('Search'),
    Wrench: icon('Wrench'),
    CalendarCheck: icon('CalendarCheck'),
    MessageSquare: icon('MessageSquare'),
    Menu: icon('Menu'),
  };
});

import TabsLayout from '../_layout';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TabsLayout', () => {
  beforeEach(() => {
    mockTabsScreen.mockClear();
  });

  it('renders without error', () => {
    render(<TabsLayout />);
  });

  it('registers exactly 5 tab screens', () => {
    render(<TabsLayout />);
    expect(mockTabsScreen).toHaveBeenCalledTimes(5);
  });

  it('registers the correct tab names in order', () => {
    render(<TabsLayout />);
    const names = mockTabsScreen.mock.calls.map(
      (call: Array<Record<string, unknown>>) => call[0].name,
    );
    expect(names).toEqual(['search', 'services', 'bookings', 'inbox', 'more']);
  });

  it('assigns correct titles to each tab', () => {
    render(<TabsLayout />);
    const titles = mockTabsScreen.mock.calls.map(
      (call: Array<Record<string, unknown>>) =>
        (call[0].options as Record<string, unknown>).title,
    );
    expect(titles).toEqual(['Search', 'Services', 'Bookings', 'Inbox', 'More']);
  });

  it('provides a tabBarIcon function for each tab', () => {
    render(<TabsLayout />);
    mockTabsScreen.mock.calls.forEach(
      (call: Array<Record<string, unknown>>) => {
        const options = call[0].options as Record<string, unknown>;
        expect(typeof options.tabBarIcon).toBe('function');
      },
    );
  });
});
