// (provider)/profile.tsx — vetting Profile step (Flow 4.7).
//
// Captures the provider's public profile (bio, coverage area, mile radius) and
// service menu, plus a weekly availability picker. Bio/coverage/radius persist
// via updateProviderProfile; services persist through ServiceMenuEditor; and on
// save we recompute provider_vetting.profile_completeness (0–100) so the vetting
// hub reflects progress.
//
// NOTE: availability is captured locally only — provider_profiles has no
// availability column yet (see AvailabilityCalendar), so it isn't persisted.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../src/components/ui/Text';
import { Button } from '../../src/components/ui/Button';
import { Spacer } from '../../src/components/ui/Spacer';
import { TextField } from '../../src/components/ui/TextField';
import { ServiceMenuEditor } from '../../src/components/provider/ServiceMenuEditor';
import {
  AvailabilityCalendar,
  DEFAULT_AVAILABILITY,
  type WeeklyAvailability,
} from '../../src/components/provider/AvailabilityCalendar';
import { colors, spacing } from '../../src/design/tokens';
import { useAuthStore } from '../../src/state/auth';
import {
  getProviderByUserId,
  getProviderOwnServicePackages,
} from '../../src/lib/supabase/queries';
import {
  updateProviderProfile,
  updateProviderVetting,
} from '../../src/lib/supabase/mutations';

const BIO_MIN = 20;

export default function ProfileStep(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [coverage, setCoverage] = useState('');
  const [radius, setRadius] = useState('');
  const [availability, setAvailability] = useState<WeeklyAvailability>(DEFAULT_AVAILABILITY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) return;
    getProviderByUserId(user.id).then((res) => {
      if (!active) return;
      if (res.data) {
        setProviderId(res.data.id);
        setBio(res.data.bio ?? '');
        setCoverage(res.data.coverage_area ?? '');
        setRadius(res.data.mile_radius != null ? String(res.data.mile_radius) : '');
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!providerId) return;
    const radiusNum = parseFloat(radius);
    setSaving(true);

    const profileRes = await updateProviderProfile(providerId, {
      bio: bio.trim() || null,
      coverage_area: coverage.trim() || null,
      mile_radius: Number.isFinite(radiusNum) ? radiusNum : null,
    });
    if (profileRes.error) {
      setSaving(false);
      Alert.alert('Could not save', profileRes.error.message);
      return;
    }

    // Recompute profile completeness (provider type is chosen at opt-in = 20).
    const pkgRes = await getProviderOwnServicePackages(providerId);
    const serviceCount = pkgRes.data?.length ?? 0;
    const completeness =
      20 +
      (bio.trim().length >= BIO_MIN ? 20 : 0) +
      (coverage.trim() ? 20 : 0) +
      (Number.isFinite(radiusNum) && radiusNum > 0 ? 10 : 0) +
      (serviceCount > 0 ? 30 : 0);

    await updateProviderVetting(providerId, { profile_completeness: completeness });
    setSaving(false);
    router.back();
  }, [providerId, bio, coverage, radius, router]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
        Which days do you accept jobs? (Saved when scheduling launches.)
      </Text>
      <Spacer size="sm" />
      <AvailabilityCalendar value={availability} onChange={setAvailability} />

      <Spacer size="lg" />
      <Text variant="label" color="charcoal">
        Service menu
      </Text>
      <Spacer size="sm" />
      {providerId ? <ServiceMenuEditor providerId={providerId} /> : null}

      <Spacer size="xl" />
      <Button
        label="Save profile"
        variant="primary"
        size="lg"
        loading={saving}
        onPress={handleSave}
        testID="profile-save"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
});
