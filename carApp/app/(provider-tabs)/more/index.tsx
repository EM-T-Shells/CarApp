// Provider More hub — the entry point for provider-side settings and the
// dashboard switch. Hosts: the provider profile summary, Services &
// Availability (manage), the vetting application, shared Account & Settings
// (reused from the customer group via absolute routes), the "Switch to Customer
// Dashboard" control, and Sign out.
//
// The switch flips the persisted active mode and replaces into the customer
// tabs. It is only reachable by dual-role ('both') users — a pure provider
// account has no customer side to switch to, so the row is hidden for them.

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
  ChevronRight,
  LogOut,
  Repeat,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { borderRadius, colors, spacing } from '../../../src/design/tokens';
import { signOut } from '../../../src/lib/supabase/auth';
import { useAuthStore } from '../../../src/state/auth';
import { useModeStore } from '../../../src/state/mode';

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
        { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
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

export default function ProviderMoreScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const setActiveMode = useModeStore((s) => s.setActiveMode);

  const [signingOut, setSigningOut] = useState(false);

  const iconColor = palette.deepIndigo;

  const go = useCallback((href: Href) => () => router.push(href), [router]);

  // Only dual-role users have a customer dashboard to switch back to.
  const canSwitchToCustomer = role === 'both';

  const switchToCustomer = useCallback((): void => {
    setActiveMode('customer');
    router.replace('/(tabs)/search');
  }, [setActiveMode, router]);

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
          accessibilityHint="Edit your profile and photo"
          testID="provider-more-profile-card"
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

        {/* Dashboard switch — dual-role users only */}
        {canSwitchToCustomer && (
          <>
            <Spacer size="lg" />
            <Pressable
              onPress={switchToCustomer}
              accessibilityRole="button"
              accessibilityLabel="Switch to customer dashboard"
              accessibilityHint="Leave the provider dashboard and return to the customer app"
              testID="provider-switch-to-customer"
              style={({ pressed }) => [
                styles.switchButton,
                { backgroundColor: palette.deepIndigo },
                pressed && styles.rowPressed,
              ]}
            >
              <Repeat size={18} color="#FFFFFF" strokeWidth={2} />
              <Text variant="label" style={{ color: '#FFFFFF' }}>
                Switch to Customer Dashboard
              </Text>
            </Pressable>
          </>
        )}

        <Spacer size="lg" />

        {/* Provider group */}
        <SectionLabel>Provider</SectionLabel>
        <View style={styles.group}>
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<SlidersHorizontal size={20} color={iconColor} strokeWidth={2} />}
            label="Services & Availability"
            subtitle="Edit your menu, prices, and weekly availability"
            onPress={go('/(provider-tabs)/more/manage')}
            testID="provider-more-manage"
          />
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<ShieldCheck size={20} color={iconColor} strokeWidth={2} />}
            label="Application"
            subtitle="View your vetting steps and status"
            onPress={go('/(provider)/vetting')}
            testID="provider-more-application"
          />
        </View>

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
            testID="provider-more-account"
          />
          <NavRow
            palette={palette}
            isDark={isDark}
            icon={<Settings size={20} color={iconColor} strokeWidth={2} />}
            label="Settings"
            subtitle="Notifications & preferences"
            onPress={go('/(tabs)/more/settings')}
            testID="provider-more-settings"
          />
        </View>

        <Spacer size="2xl" />

        {/* Sign out */}
        <Pressable
          onPress={confirmSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          testID="provider-more-sign-out"
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
  switchButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
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
