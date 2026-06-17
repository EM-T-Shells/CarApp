// (tabs)/more/provider-manage.tsx — provider profile management (Flows 5.2 / 5.3).
//
// Post-approval companion to the vetting Profile step: lets an active provider
// edit their public profile (bio, coverage area, travel radius), set their
// weekly availability (persisted to provider_profiles.availability), and manage
// their service menu via ServiceMenuEditor. Reached from the provider dashboard
// (More → Provider). Unlike the vetting step, it does not recompute
// profile_completeness or route back into the vetting stack — it's a standalone
// editable screen with explicit Save.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Spacer } from '../../../src/components/ui/Spacer';
import { TextField } from '../../../src/components/ui/TextField';
import { ServiceMenuEditor } from '../../../src/components/provider/ServiceMenuEditor';
import {
  AvailabilityCalendar,
  DEFAULT_AVAILABILITY,
  availabilityFromJson,
  type WeeklyAvailability,
} from '../../../src/components/provider/AvailabilityCalendar';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import { getProviderByUserId } from '../../../src/lib/supabase/queries';
import { updateProviderProfile } from '../../../src/lib/supabase/mutations';

const BIO_MIN = 20;

export default function ProviderManageScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [coverage, setCoverage] = useState('');
  const [radius, setRadius] = useState('');
  const [availability, setAvailability] =
    useState<WeeklyAvailability>(DEFAULT_AVAILABILITY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const res = await getProviderByUserId(user.id);
    if (res.error || !res.data) {
      setError(res.error?.message ?? 'Provider profile not found.');
      setLoading(false);
      return;
    }
    setProviderId(res.data.id);
    setBio(res.data.bio ?? '');
    setCoverage(res.data.coverage_area ?? '');
    setRadius(res.data.mile_radius != null ? String(res.data.mile_radius) : '');
    setAvailability(availabilityFromJson(res.data.availability));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!providerId) return;
    const radiusNum = parseFloat(radius);
    setSaving(true);
    const res = await updateProviderProfile(providerId, {
      bio: bio.trim() || null,
      coverage_area: coverage.trim() || null,
      mile_radius: Number.isFinite(radiusNum) ? radiusNum : null,
      availability,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert('Could not save', res.error.message);
      return;
    }
    Alert.alert('Saved', 'Your provider profile has been updated.');
  }, [providerId, bio, coverage, radius, availability]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Services & Availability' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error || !providerId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Services & Availability' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <Text variant="subheading" color="charcoal">
            Couldn&apos;t load your profile
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            {error ?? 'Please try again.'}
          </Text>
          <Spacer size="lg" />
          <Button label="Retry" variant="primary" size="md" onPress={load} />
        </View>
      </>
    );
  }

  // ── Loaded ───────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ title: 'Services & Availability' }} />
      <ScrollView
        style={{ backgroundColor: palette.offWhite }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="label" color="charcoal">
          Public profile
        </Text>
        <Spacer size="sm" />
        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Tell customers about your experience and what makes your work stand out."
          multiline
          hint={`At least ${BIO_MIN} characters.`}
        />
        <Spacer size="md" />
        <TextField
          label="Coverage area"
          value={coverage}
          onChangeText={setCoverage}
          placeholder="e.g. Reston, Herndon, Vienna"
          autoCapitalize="words"
        />
        <Spacer size="md" />
        <TextField
          label="Travel radius (miles)"
          value={radius}
          onChangeText={setRadius}
          placeholder="25"
          keyboardType="number-pad"
          maxLength={3}
        />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Weekly availability
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          Which days do you accept jobs?
        </Text>
        <Spacer size="sm" />
        <AvailabilityCalendar value={availability} onChange={setAvailability} />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Service menu
        </Text>
        <Spacer size="sm" />
        <ServiceMenuEditor providerId={providerId} />

        <Spacer size="xl" />
        <Button
          label="Save changes"
          variant="primary"
          size="lg"
          loading={saving}
          onPress={handleSave}
          testID="provider-manage-save"
        />
        <Spacer size="md" />
        <Text variant="caption" color="midGray" style={styles.centeredText}>
          Service changes save instantly. Tap Save to update your profile and
          availability.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.base },
  centeredText: { textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
});
