// JobStatusBar — top-of-screen status pill used on the live-tracking
// screen. Renders the current booking status with a color-coded background
// (gold for En Route, indigo for Arrived, green for In Progress), plus an
// optional provider name on the left so the customer always sees who is
// coming. Designed to overlay the map at the safe-area top.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Navigation, MapPin, Wrench, Check, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing } from '../../design/tokens';
import type { BookingStatus } from '../booking/StatusTimeline';

// ─── Types ─────────────────────────────────────────────────────────────

export interface JobStatusBarProps {
  status: BookingStatus;
  providerName?: string;
}

interface StatusConfig {
  label: string;
  colorKey: keyof typeof colors.light;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

const STATUS_CONFIG: Record<BookingStatus, StatusConfig> = {
  pending: { label: 'Pending', colorKey: 'midGray', Icon: MapPin },
  pending_provider_approval: { label: 'Awaiting Provider', colorKey: 'midGray', Icon: MapPin },
  confirmed: { label: 'Confirmed', colorKey: 'electricBlue', Icon: Check },
  en_route: { label: 'En Route', colorKey: 'gearGold', Icon: Navigation },
  in_progress: { label: 'In Progress', colorKey: 'emeraldGreen', Icon: Wrench },
  completed: { label: 'Completed', colorKey: 'emeraldGreen', Icon: Check },
  cancelled: { label: 'Cancelled', colorKey: 'midGray', Icon: X },
  no_show: { label: 'No-Show', colorKey: 'midGray', Icon: X },
};

// ─── Component ─────────────────────────────────────────────────────────

export function JobStatusBar({
  status,
  providerName,
}: JobStatusBarProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const accent = palette[cfg.colorKey];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF',
          shadowColor: '#000',
        },
      ]}
      accessibilityRole="header"
      accessibilityLabel={
        providerName
          ? `${providerName} — ${cfg.label}`
          : `Job status: ${cfg.label}`
      }
    >
      {providerName && (
        <Text
          variant="label"
          color="charcoal"
          numberOfLines={1}
          style={styles.providerName}
        >
          {providerName}
        </Text>
      )}
      <View
        style={[styles.pill, { backgroundColor: accent + '22', borderColor: accent }]}
      >
        <cfg.Icon size={14} color={accent} strokeWidth={2.5} />
        <Text variant="label" style={{ color: accent }}>
          {cfg.label}
        </Text>
      </View>
    </View>
  );
}

export default JobStatusBar;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  providerName: {
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1.5,
  },
});
