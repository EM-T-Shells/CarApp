// (provider-tabs) layout — the provider dashboard's own 4-tab bottom bar,
// mounted for providers instead of the customer (tabs) bar. A dual-role
// ('both') user reaches it by switching into provider mode from the customer
// More hub; a pure provider account lands here directly from the auth gate.
//
// Tabs: Jobs, Inbox, Earnings, More. Mirrors the customer tab shell's icon /
// token / dark-mode conventions. The customer-facing Lug bubble is
// intentionally not mounted here — this is a work surface, not a car-care one.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { Briefcase, MessageSquare, Wallet, Menu } from 'lucide-react-native';
import { colors, spacing } from '../../src/design/tokens';

// ─── Icon size for tab bar ──────────────────────────────────────────────────

const TAB_ICON_SIZE = 24;

// ─── Tab Layout ─────────────────────────────────────────────────────────────

export default function ProviderTabsLayout(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.electricBlue,
        tabBarInactiveTintColor: palette.midGray,
        tabBarStyle: {
          backgroundColor: palette.offWhite,
          borderTopColor: scheme === 'dark' ? '#2A2A3E' : '#E5E7EB',
          paddingBottom: spacing.sm,
          paddingTop: spacing.xs,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Inter',
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => (
            <Briefcase size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => (
            <MessageSquare size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color }) => (
            <Wallet size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => (
            <Menu size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
