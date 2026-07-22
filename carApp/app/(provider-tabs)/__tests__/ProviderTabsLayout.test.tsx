// ProviderTabsLayout.test.tsx — unit tests for the provider dashboard's
// 4-tab bottom navigation layout.

import React from 'react';
import { render } from '@testing-library/react-native';

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
    Briefcase: icon('Briefcase'),
    MessageSquare: icon('MessageSquare'),
    Wallet: icon('Wallet'),
    Menu: icon('Menu'),
  };
});

import ProviderTabsLayout from '../_layout';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProviderTabsLayout', () => {
  beforeEach(() => {
    mockTabsScreen.mockClear();
  });

  it('renders without error', () => {
    render(<ProviderTabsLayout />);
  });

  it('registers exactly 4 tab screens', () => {
    render(<ProviderTabsLayout />);
    expect(mockTabsScreen).toHaveBeenCalledTimes(4);
  });

  it('registers the correct tab names in order', () => {
    render(<ProviderTabsLayout />);
    const names = mockTabsScreen.mock.calls.map(
      (call: Array<Record<string, unknown>>) => call[0].name,
    );
    expect(names).toEqual(['jobs', 'inbox', 'earnings', 'more']);
  });

  it('assigns correct titles to each tab', () => {
    render(<ProviderTabsLayout />);
    const titles = mockTabsScreen.mock.calls.map(
      (call: Array<Record<string, unknown>>) =>
        (call[0].options as Record<string, unknown>).title,
    );
    expect(titles).toEqual(['Jobs', 'Inbox', 'Earnings', 'More']);
  });

  it('provides a tabBarIcon function for each tab', () => {
    render(<ProviderTabsLayout />);
    mockTabsScreen.mock.calls.forEach((call: Array<Record<string, unknown>>) => {
      const options = call[0].options as Record<string, unknown>;
      expect(typeof options.tabBarIcon).toBe('function');
    });
  });
});
