// More tab hub (Flow 3.3) — the entry point for everything that doesn't get
// its own bottom tab: Account, Settings, Bookings history, Lug AI, Provider
// mode, and Sign out.
//
// Reads the signed-in user straight from the hydrated auth store (no fetch,
// so there's no loading/empty/error state to manage here). The Provider row
// adapts to the user's role: customers see "Become a Provider", providers see
// "Provider Dashboard". Both route to (tabs)/more/provider, which decides
// between the intro and the dashboard. Sign out keeps the confirmation alert
// so an accidental tap can't drop the session.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import {
  Bot,
  ChevronRight,
  Clock,
  LogOut,
  Settings,
  User,
  Wrench,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { borderRadius, colors, spacing } from '../../../src/design/tokens';
import { signOut } from '../../../src/lib/supabase/auth';
import { useAuthStore, selectIsProvider } from '../../../src/state/auth';

type Palette = (typeof colors)['light'] | (typeof colors)['dark'];

// ── NavRow ───────────────────────────────────────────────────────────────

interface NavRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
  palette: Palette;
  isDark: boolean;
  testID?: string;
}

function NavRow({
  icon,
  label,
  subtitle,
  onPress,
  palette,
  isDark,
  testID,
}: NavRowProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={subtitle}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF',
        },
        pressed && styles.rowPressed,
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: isDark
              ? 'rgba(141,139,222,0.15)'
              : 'rgba(61,59,142,0.08)',
          },
        ]}
      >
        {icon}
      </View>
      <View style={styles.rowText}>
        <Text variant="label" color="charcoal">
          {label}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="midGray" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={palette.midGray} strokeWidth={2} />
    </Pressable>
  );
}

// ── SectionLabel ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Text variant="caption" color="midGray" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </Text>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MoreScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const isProvider = useAuthStore(selectIsProvider);

  const [signingOut, setSigningOut] = useState(false);

  const iconColor = palette.deepIndigo;

  const go = useCallback(
    (href: Href) => () => router.push(href),
    [router],
  );

  const handleSignOut = useCallback(async (): Promise<void> => {
    setSigningOut(true);
    await signOut();
    // The root auth gate detects the cleared session and routes to (auth)/.
  }, []);

  const confirmSignOut = useCallback((): void => {
    if (signingOut) return;
    Alert.alert(
      'Sign out?',
      'You will need to sign in again to access your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: handleSignOut },
      ],
    );
  }, [signingOut, handleSignOut]);

  const displayName = user?.full_name?.trim() || 'Your account';
  const contact = user?.email ?? user?.phone ?? null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading" color="charcoal" style={styles.title}>
          More
        </Text>

        {/* Profile summary → Account */}
        <Pressable
          onPress={go('/(tabs)/more/account')}
          accessibilityRole="button"
          accessibilityLabel="View account"
          accessibilityHint="Edit your profile, photo, and vehicles"
          testID="more-profile-card"
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
            pressed && styles.rowPressed,
          ]}
        >
          <Avatar uri={user?.avatar_url} name={displayName} size="lg" />
          <View style={styles.profileText}>
            <Text variant="subheading" color="charcoal" numberOfLines={1}>
              {displayName}
            </Text>
            {contact ? (
              <Text variant="bodySmall" color="midGray" numberOfLines={1}>
                {contact}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={20} color={palette.midGray} strokeWidth={2} />
        </Pressable>

        <Spacer size="lg" />

        {/* Account group */}
        <SectionLabel>Account</SectionLabel>
        <View style={styles.group}>
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<User size={20} color={iconColor} strokeWidth={2} />}
            label="Account"
            subtitle="Profile, photo & vehicles"
            onPress={go('/(tabs)/more/account')}
            testID="more-account"
          />
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<Settings size={20} color={iconColor} strokeWidth={2} />}
            label="Settings"
            subtitle="Notifications & preferences"
            onPress={go('/(tabs)/more/settings')}
            testID="more-settings"
          />
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<Clock size={20} color={iconColor} strokeWidth={2} />}
            label="Booking history"
            subtitle="Past & cancelled bookings"
            onPress={go('/(tabs)/bookings/past')}
            testID="more-history"
          />
        </View>

        <Spacer size="lg" />

        {/* Assistant */}
        <SectionLabel>Assistant</SectionLabel>
        <View style={styles.group}>
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<Bot size={20} color={palette.gearGold} strokeWidth={2} />}
            label="Ask Lug"
            subtitle="Car-care help & recommendations"
            onPress={go('/(tabs)/more/lug')}
            testID="more-lug"
          />
        </View>

        <Spacer size="lg" />

        {/* Provider */}
        <SectionLabel>Provider</SectionLabel>
        <View style={styles.group}>
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<Wrench size={20} color={iconColor} strokeWidth={2} />}
            label={isProvider ? 'Provider Dashboard' : 'Become a Provider'}
            subtitle={
              isProvider
                ? 'Jobs, earnings & your profile'
                : 'Earn by detailing cars near you'
            }
            onPress={go('/(tabs)/more/provider')}
            testID="more-provider"
          />
        </View>

        <Spacer size="2xl" />

        {/* Sign out */}
        <Pressable
          onPress={confirmSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          testID="more-sign-out"
          style={({ pressed }) => [
            styles.signOutButton,
            { borderColor: palette.deepIndigo },
            pressed && !signingOut && styles.rowPressed,
            signingOut && styles.signOutDisabled,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color={palette.deepIndigo} />
          ) : (
            <>
              <LogOut size={18} color={palette.deepIndigo} strokeWidth={2} />
              <Text variant="label" style={{ color: palette.deepIndigo }}>
                Sign out
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  title: {
    marginBottom: spacing.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: borderRadius.card,
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    letterSpacing: 0.6,
  },
  group: {
    borderRadius: borderRadius.card,
    overflow: 'hidden',
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutDisabled: {
    opacity: 0.5,
  },
});
