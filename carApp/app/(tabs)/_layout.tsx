// (tabs) layout — configures the 5-tab bottom navigation bar.
// Tabs: Search, Services, Bookings, Inbox, More.
// Uses Lucide icons, design tokens for colors/spacing, and
// automatic dark-mode support via useColorScheme.

import React from 'react';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import {
  Search,
  Wrench,
  CalendarCheck,
  MessageSquare,
  Menu,
} from 'lucide-react-native';
import { colors, spacing } from '../../src/design/tokens';

// ─── Icon size for tab bar ──────────────────────────────────────────────────

const TAB_ICON_SIZE = 24;

// ─── Tab Layout ─────────────────────────────────────────────────────────────

export default function TabsLayout(): React.ReactElement {
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
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <Search size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarIcon: ({ color }) => (
            <Wrench size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color }) => (
            <CalendarCheck size={TAB_ICON_SIZE} color={color} />
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
