// Provider screen (Flow 4.1) — the More → Provider entry point.
//
// Three states based on the signed-in user:
//   • Customer (no provider role yet): the "Become a Provider" intro — what's
//     expected, fees, the founding-provider program — plus a provider-type
//     pick. "Start application" creates the provider_profiles row (a DB trigger
//     seeds provider_vetting), flips the user's role to 'both', seeds the
//     providerDraft, and routes into the (provider) vetting flow.
//   • Provider, not yet approved: a short status card → "Continue application".
//   • Approved provider: a minimal confirmation (the full jobs/earnings
//     dashboard is Section 5).

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Check, ShieldCheck, Wrench } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, borderRadius, spacing } from '../../../src/design/tokens';
import { useAuthStore, selectIsProvider } from '../../../src/state/auth';
import { useProviderDraftStore } from '../../../src/state/providerDraft';
import {
  getProviderByUserId,
  getProviderTypes,
} from '../../../src/lib/supabase/queries';
import {
  insertProviderProfile,
  updateUser,
} from '../../../src/lib/supabase/mutations';
import type { ProviderProfile, ProviderType } from '../../../src/types/models';

type Palette = (typeof colors)['light'] | (typeof colors)['dark'];

const PERKS: readonly string[] = [
  'Keep 95% of every job — just a 5% platform fee.',
  'Founding providers pay 0% for their first 3 months.',
  'You set your own services, prices, and coverage area.',
  'Get paid securely through CarApp — no chasing invoices.',
];

// ── Intro / opt-in ─────────────────────────────────────────────────────────

interface IntroProps {
  palette: Palette;
  onStarted: () => void;
}

function ProviderIntro({ palette, onStarted }: IntroProps): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const setDraftProfile = useProviderDraftStore((s) => s.setProfile);

  const [types, setTypes] = useState<ProviderType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getProviderTypes().then((res) => {
      if (active && res.data) setTypes(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleStart = useCallback(async (): Promise<void> => {
    if (!user || !session || !selectedTypeId || submitting) return;
    setSubmitting(true);
    const profileRes = await insertProviderProfile({
      user_id: user.id,
      provider_type_id: selectedTypeId,
    });
    if (profileRes.error || !profileRes.data) {
      setSubmitting(false);
      Alert.alert(
        'Could not start',
        profileRes.error?.message ?? 'Please try again.',
      );
      return;
    }
    // Seed the draft so the profile step can prefill the chosen type.
    setDraftProfile({ providerTypeId: selectedTypeId });
    // Promote the user to a dual customer+provider role.
    const userRes = await updateUser(user.id, { role: 'both' });
    if (userRes.data) setSession(session, userRes.data);
    setSubmitting(false);
    onStarted();
  }, [user, session, selectedTypeId, submitting, setDraftProfile, setSession, onStarted]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.heroIcon}>
        <Wrench size={30} color={palette.deepIndigo} strokeWidth={2} />
      </View>
      <Spacer size="md" />
      <Text variant="heading" color="charcoal">
        Become a Provider
      </Text>
      <Spacer size="sm" />
      <Text variant="body" color="midGray">
        Turn your detailing skills into income. Set your own schedule and serve
        customers across the DC metro.
      </Text>

      <Spacer size="lg" />
      <Card variant="outlined" contentStyle={styles.perks}>
        {PERKS.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <Check size={16} color={palette.emeraldGreen} strokeWidth={2.5} />
            <Spacer size="sm" horizontal />
            <Text variant="bodySmall" color="charcoal" style={styles.flex}>
              {perk}
            </Text>
          </View>
        ))}
      </Card>

      <Spacer size="lg" />
      <Text variant="label" color="charcoal">
        What do you offer?
      </Text>
      <Spacer size="sm" />
      <View style={styles.typeRow}>
        {types.map((type) => {
          const selected = type.id === selectedTypeId;
          return (
            <Pressable
              key={type.id}
              onPress={() => setSelectedTypeId(type.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={type.label}
              testID={`provider-type-${type.name}`}
              style={[
                styles.typeChip,
                {
                  borderColor: selected ? palette.electricBlue : palette.midGray,
                  backgroundColor: selected
                    ? palette.electricBlue + '14'
                    : 'transparent',
                },
              ]}
            >
              <Text
                variant="label"
                style={{ color: selected ? palette.electricBlue : palette.charcoal }}
              >
                {type.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Spacer size="xl" />
      <Button
        label="Start application"
        variant="primary"
        size="lg"
        disabled={!selectedTypeId}
        loading={submitting}
        onPress={handleStart}
        testID="provider-start"
      />
      <Spacer size="sm" />
      <Text variant="caption" color="midGray" style={styles.finePrint}>
        You&apos;ll complete identity, background, insurance, credentials, bank,
        and profile steps before going live. A 2% customer service fee applies at
        checkout.
      </Text>
    </ScrollView>
  );
}

// ── Status (provider, not yet approved) ─────────────────────────────────────

interface StatusProps {
  palette: Palette;
  approved: boolean;
  onOpen: () => void;
}

function ProviderStatus({ palette, approved, onOpen }: StatusProps): React.ReactElement {
  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.heroIcon}>
        {approved ? (
          <BadgeCheck size={30} color={palette.emeraldGreen} strokeWidth={2} />
        ) : (
          <ShieldCheck size={30} color={palette.deepIndigo} strokeWidth={2} />
        )}
      </View>
      <Spacer size="md" />
      <Text variant="heading" color="charcoal">
        {approved ? "You're a CarApp Provider" : 'Your application'}
      </Text>
      <Spacer size="sm" />
      <Text variant="body" color="midGray">
        {approved
          ? 'Your account is approved. The jobs & earnings dashboard is coming soon.'
          : 'Pick up where you left off and complete the remaining steps to go live.'}
      </Text>
      <Spacer size="xl" />
      <Button
        label={approved ? 'View application' : 'Continue application'}
        variant="primary"
        size="lg"
        onPress={onOpen}
        testID="provider-continue"
      />
    </ScrollView>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function ProviderScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const isProvider = useAuthStore(selectIsProvider);

  const [loading, setLoading] = useState(isProvider);
  const [profile, setProfile] = useState<ProviderProfile | null>(null);

  useEffect(() => {
    let active = true;
    if (!isProvider || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getProviderByUserId(user.id).then((res) => {
      if (!active) return;
      setProfile(res.data ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isProvider, user]);

  const openVetting = useCallback(() => {
    router.push('/(provider)/vetting');
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
      </View>
    );
  }

  // Provider with a profile → status / dashboard.
  if (isProvider && profile) {
    return (
      <ProviderStatus
        palette={palette}
        approved={profile.verification_status === 'approved'}
        onOpen={openVetting}
      />
    );
  }

  // Customer (or provider role flagged but profile not yet created) → intro.
  return <ProviderIntro palette={palette} onStarted={openVetting} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(61,59,142,0.08)',
  },
  perks: { gap: spacing.md },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    minHeight: 44,
    paddingHorizontal: spacing.base,
    justifyContent: 'center',
    borderRadius: borderRadius.button,
    borderWidth: 1.5,
  },
  finePrint: { textAlign: 'center' },
});
