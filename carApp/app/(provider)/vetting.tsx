// Vetting hub (Flow 4.1 scaffold) — the home of the provider application.
// Shows progress across the six steps (profile + the five vetting checks) and
// routes into each step screen. Re-reads status on focus so returning from a
// step reflects the latest state. When everything is approved the provider's
// verification_status flips to 'approved' (admin/server side) and this screen
// surfaces the approved banner plus the way out to the provider dashboard.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { CheckCircle2, ChevronRight } from 'lucide-react-native';
import { Text } from '../../src/components/ui/Text';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Spacer } from '../../src/components/ui/Spacer';
import {
  VettingStepIndicator,
  type VettingStatus,
} from '../../src/components/provider/VettingStepIndicator';
import {
  VETTING_STEPS,
  PROFILE_COMPLETENESS_THRESHOLD,
} from '../../src/components/provider/vettingSteps';
import { colors, spacing } from '../../src/design/tokens';
import { useAuthStore, selectIsProvider } from '../../src/state/auth';
import { useModeStore } from '../../src/state/mode';
import {
  getProviderByUserId,
  getProviderVetting,
} from '../../src/lib/supabase/queries';
import { insertProviderProfile } from '../../src/lib/supabase/mutations';
import type { ProviderProfile, ProviderVetting } from '../../src/types/models';

type Palette = (typeof colors)['light'] | (typeof colors)['dark'];

const STATUS_LABEL: Record<VettingStatus, string> = {
  pending: 'Not started',
  submitted: 'Under review',
  approved: 'Approved',
  rejected: 'Needs attention',
};

function statusColor(status: VettingStatus, palette: Palette): string {
  switch (status) {
    case 'approved':
      return palette.emeraldGreen;
    case 'submitted':
      return palette.gearGold;
    case 'rejected':
      return '#D92B2B';
    default:
      return palette.midGray;
  }
}

interface ResolvedStep {
  key: string;
  label: string;
  route: string;
  status: VettingStatus;
}

function resolveSteps(vetting: ProviderVetting | null): ResolvedStep[] {
  return VETTING_STEPS.map((step) => {
    let status: VettingStatus = 'pending';
    if (step.statusField === 'profile') {
      status =
        (vetting?.profile_completeness ?? 0) >= PROFILE_COMPLETENESS_THRESHOLD
          ? 'approved'
          : 'pending';
    } else {
      status = (vetting?.[step.statusField] as VettingStatus | undefined) ?? 'pending';
    }
    return { key: step.key, label: step.label, route: step.route, status };
  });
}

export default function VettingHubScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isProvider = useAuthStore(selectIsProvider);
  const setActiveMode = useModeStore((s) => s.setActiveMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ResolvedStep[]>([]);
  const [approved, setApproved] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    setError(null);
    const profileRes = await getProviderByUserId(user.id);
    if (profileRes.error) {
      setError('We could not load your provider application.');
      setLoading(false);
      return;
    }

    // No provider_profiles row yet. A provider-role account reaches this state
    // when the row failed to create during onboarding — the root gate then
    // parks them on pending-approval and "Continue your application" lands
    // here, so without a repair there is no way forward at all. Create the row
    // on the spot (a DB trigger seeds provider_vetting off it) and carry on
    // with the application, same as More → Provider "Start application".
    // provider_type_id stays null; the profile step sets it.
    let profile: ProviderProfile | null = profileRes.data;
    if (!profile) {
      if (!isProvider) {
        setError('We could not find your provider application.');
        setLoading(false);
        return;
      }
      const createdRes = await insertProviderProfile({ user_id: user.id });
      if (createdRes.error || !createdRes.data) {
        setError('We could not start your provider application.');
        setLoading(false);
        return;
      }
      profile = createdRes.data;
    }

    setApproved(profile.verification_status === 'approved');
    const vettingRes = await getProviderVetting(profile.id);
    setSteps(resolveSteps(vettingRes.data ?? null));
    setLoading(false);
  }, [user, isProvider]);

  // The way out for an approved provider. This screen is the root of the
  // (provider) stack when it's opened directly (pending-approval → Continue, a
  // reload, a deep link), so there's no header back button, and the root gate
  // deliberately leaves anyone inside the (provider) group alone — without this
  // an approved provider is stranded on their own application. replace() rather
  // than push() so the dashboard doesn't stack on top of the vetting flow.
  const goToDashboard = useCallback((): void => {
    setActiveMode('provider');
    router.replace('/(provider-tabs)/jobs');
  }, [setActiveMode, router]);

  // Refresh whenever the hub regains focus (e.g. returning from a step).
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="subheading" color="charcoal">
          Something went wrong
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray" style={styles.centeredText}>
          {error}
        </Text>
        <Spacer size="lg" />
        <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry">
          <Text variant="label" color="electricBlue">
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const approvedCount = steps.filter((s) => s.status === 'approved').length;
  const allApproved = approvedCount === steps.length;
  const indicatorSteps = steps.map((s) => ({
    key: s.key,
    label: s.label,
    status: s.status,
  }));

  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
    >
      {approved ? (
        <>
          <Card variant="outlined" style={styles.banner}>
            <CheckCircle2 size={22} color={palette.emeraldGreen} strokeWidth={2} />
            <Spacer size="sm" horizontal />
            <Text variant="label" color="charcoal" style={styles.flex}>
              You&apos;re approved! You can start accepting bookings.
            </Text>
          </Card>
          <Spacer size="md" />
          <Button
            label="Go to dashboard"
            variant="primary"
            size="lg"
            onPress={goToDashboard}
            testID="vetting-go-to-dashboard"
          />
        </>
      ) : (
        <Text variant="body" color="midGray">
          Complete all six steps to start accepting bookings. {approvedCount} of{' '}
          {steps.length} approved.
        </Text>
      )}

      <Spacer size="md" />
      <VettingStepIndicator steps={indicatorSteps} />
      <Spacer size="md" />

      <View style={styles.list}>
        {steps.map((step) => {
          const color = statusColor(step.status, palette);
          return (
            <Card
              key={step.key}
              onPress={() => router.push(step.route as Href)}
              accessibilityLabel={`${step.label}: ${STATUS_LABEL[step.status]}`}
              accessibilityHint="Tap to open this step"
            >
              <View style={styles.row}>
                <Text variant="label" color="charcoal" style={styles.flex}>
                  {step.label}
                </Text>
                <View style={[styles.badge, { borderColor: color }]}>
                  <Text variant="caption" style={{ color }}>
                    {STATUS_LABEL[step.status]}
                  </Text>
                </View>
                <ChevronRight size={18} color={palette.midGray} strokeWidth={2} />
              </View>
            </Card>
          );
        })}
      </View>

      {allApproved && !approved ? (
        <>
          <Spacer size="lg" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            All steps submitted — our team is reviewing your application.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.base },
  centeredText: { textAlign: 'center', maxWidth: 300 },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center' },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
  },
});
