// Settings screen (Flow 3.2) — notification preferences plus app/legal info.
//
// Notification toggles are persisted locally via the settings Zustand store
// (AsyncStorage-backed) because the `users` table has no preference columns
// yet and we are not running a migration for them now. Once FCM push
// registration (Flow 2.9) lands, the notify-* Edge Functions should honor
// these before delivering a push.

import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  useColorScheme,
} from 'react-native';
import Constants from 'expo-constants';
import { Text } from '../../../src/components/ui/Text';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing } from '../../../src/design/tokens';
import {
  useSettingsStore,
  type NotificationPreferenceKey,
} from '../../../src/state/settings';

interface ToggleRow {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}

const NOTIFICATION_ROWS: readonly ToggleRow[] = [
  {
    key: 'bookingUpdates',
    label: 'Booking updates',
    description: 'Confirmations and status changes for your bookings.',
  },
  {
    key: 'providerEnRoute',
    label: 'Provider en route',
    description: 'Alerts when your provider is on the way or has arrived.',
  },
  {
    key: 'messages',
    label: 'New messages',
    description: 'When a provider or support replies in your inbox.',
  },
  {
    key: 'promotions',
    label: 'Promotions & offers',
    description: 'Occasional deals and product news.',
  },
] as const;

export default function SettingsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const notifications = useSettingsStore((s) => s.notifications);
  const toggleNotification = useSettingsStore((s) => s.toggleNotification);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—';

  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
    >
      {/* Notifications */}
      <Text variant="label" color="midGray" style={styles.sectionLabel}>
        NOTIFICATIONS
      </Text>
      <Card variant="outlined" contentStyle={styles.cardContent}>
        {NOTIFICATION_ROWS.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="label" color="charcoal">
                  {row.label}
                </Text>
                <Text variant="caption" color="midGray">
                  {row.description}
                </Text>
              </View>
              <Switch
                value={notifications[row.key]}
                onValueChange={() => toggleNotification(row.key)}
                trackColor={{ true: palette.emeraldGreen }}
                accessibilityLabel={row.label}
                accessibilityRole="switch"
                testID={`settings-toggle-${row.key}`}
              />
            </View>
          </View>
        ))}
      </Card>
      <Spacer size="xs" />
      <Text variant="caption" color="midGray" style={styles.note}>
        Push delivery also depends on your device&apos;s system notification
        permissions.
      </Text>

      <Spacer size="lg" />

      {/* About & legal */}
      <Text variant="label" color="midGray" style={styles.sectionLabel}>
        ABOUT
      </Text>
      <Card variant="outlined" contentStyle={styles.cardContent}>
        <LinkRow
          label="Terms of Service"
          onPress={() => Linking.openURL('https://carapp.example/terms')}
          palette={palette}
        />
        <View style={styles.divider} />
        <LinkRow
          label="Privacy Policy"
          onPress={() => Linking.openURL('https://carapp.example/privacy')}
          palette={palette}
        />
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text variant="label" color="charcoal">
            App version
          </Text>
          <Text variant="bodySmall" color="midGray">
            {appVersion}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

// ── LinkRow ─────────────────────────────────────────────────────────────────

interface LinkRowProps {
  label: string;
  onPress: () => void;
  palette: (typeof colors)['light'] | (typeof colors)['dark'];
}

function LinkRow({ label, onPress, palette }: LinkRowProps): React.ReactElement {
  return (
    <Text
      variant="label"
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={[styles.linkRow, { color: palette.electricBlue }]}
    >
      {label}
    </Text>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    letterSpacing: 0.6,
  },
  cardContent: {
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(119,119,119,0.3)',
  },
  note: {
    marginLeft: spacing.xs,
  },
  linkRow: {
    paddingVertical: spacing.md,
    minHeight: 44,
  },
});
