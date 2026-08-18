// (provider-tabs)/more/manage — provider profile management (Flows 5.2 / 5.3).
//
// Post-approval companion to the vetting Profile step: lets an active provider
// edit their public profile (bio, coverage area, travel radius), their schedule
// (timezone, per-day working hours, job buffers, daily cap and time off), and
// their service menu via ServiceMenuEditor. Pushed from the provider More hub.
//
// The day-level AvailabilityCalendar is gone from this screen: working_hours
// supersedes it with real windows, and offering both would let a provider set
// 9-5 Monday in one control and untick Monday in the other. The legacy
// availability column is still written, derived from the hours on save, because
// other readers have not migrated yet — deriving it rather than editing it is
// what keeps the two from disagreeing.
// Unlike the vetting step, it does not recompute profile_completeness or route
// back into the vetting stack — it's a standalone editable screen with explicit
// Save.
//
// Moved from (tabs)/more/provider-manage.tsx when the provider dashboard got its
// own tab bar.

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
import { WorkingHoursEditor } from '../../../src/components/provider/WorkingHoursEditor';
import { TimeOffEditor } from '../../../src/components/provider/TimeOffEditor';
import { TimezoneField } from '../../../src/components/provider/TimezoneField';
import { DurationModifierEditor } from '../../../src/components/provider/DurationModifierEditor';
import {
  DEFAULT_TIMEZONE,
  DEFAULT_WORKING_HOURS,
  describeWorkingHours,
  workingHoursFromJson,
  workingHoursToAvailability,
  type WorkingHours,
} from '../../../src/utils/schedule';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getProviderByUserId,
  getProviderTimeOff,
  getServiceDurationModifiers,
} from '../../../src/lib/supabase/queries';
import {
  deleteProviderTimeOff,
  deleteServiceDurationModifier,
  insertProviderTimeOff,
  isTimeOffOverlapError,
  updateProviderProfile,
  upsertServiceDurationModifier,
} from '../../../src/lib/supabase/mutations';
import type { FactorType } from '../../../src/utils/suggestion';
import type {
  ProviderTimeOff,
  ServiceDurationModifier,
} from '../../../src/types/models';

const BIO_MIN = 20;

// How far ahead the time-off list looks. A year is long enough to hold next
// summer's holiday and short enough that the list stays readable.
const TIME_OFF_HORIZON_DAYS = 365;

/** Buffers are minutes and the column is an INT; anything else must not be sent. */
function parseBufferMins(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  // A buffer longer than a working day is a typo, not a preference.
  return Math.min(parsed, 480);
}

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
  const [workingHours, setWorkingHours] =
    useState<WorkingHours>(DEFAULT_WORKING_HOURS);
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [maxJobs, setMaxJobs] = useState('');
  const [bufferBefore, setBufferBefore] = useState('');
  const [bufferAfter, setBufferAfter] = useState('');
  const [timeOff, setTimeOff] = useState<ProviderTimeOff[]>([]);
  const [timeOffBusy, setTimeOffBusy] = useState(false);
  const [modifiers, setModifiers] = useState<ServiceDurationModifier[]>([]);
  const [modifiersBusy, setModifiersBusy] = useState(false);
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
    setWorkingHours(workingHoursFromJson(res.data.working_hours));
    setTimezone(res.data.timezone || DEFAULT_TIMEZONE);
    setMaxJobs(
      res.data.max_jobs_per_day != null ? String(res.data.max_jobs_per_day) : '',
    );
    setBufferBefore(String(res.data.default_buffer_before_mins ?? 15));
    setBufferAfter(String(res.data.default_buffer_after_mins ?? 30));
    const off = await getProviderTimeOff(
      res.data.id,
      new Date(),
      new Date(Date.now() + TIME_OFF_HORIZON_DAYS * 24 * 60 * 60 * 1000),
    );
    if (off.data) setTimeOff(off.data);

    const mods = await getServiceDurationModifiers(res.data.id);
    if (mods.data) setModifiers(mods.data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!providerId) return;
    const radiusNum = parseFloat(radius);
    const maxJobsNum = parseInt(maxJobs, 10);
    setSaving(true);
    const res = await updateProviderProfile(providerId, {
      bio: bio.trim() || null,
      coverage_area: coverage.trim() || null,
      mile_radius: Number.isFinite(radiusNum) ? radiusNum : null,
      working_hours: workingHours,
      timezone,
      // NULL means no cap, which is the current behaviour — an empty field has
      // to clear the limit rather than saving zero, which would take the
      // provider off the calendar entirely.
      max_jobs_per_day:
        Number.isFinite(maxJobsNum) && maxJobsNum > 0 ? maxJobsNum : null,
      default_buffer_before_mins: parseBufferMins(bufferBefore, 15),
      default_buffer_after_mins: parseBufferMins(bufferAfter, 30),
      // Kept in step with working_hours rather than saved from the day picker.
      // Both columns exist until the legacy readers are gone, and letting them
      // disagree would make which one a screen happened to read decide whether
      // a provider looks open.
      availability: workingHoursToAvailability(workingHours),
    });
    setSaving(false);
    if (res.error) {
      Alert.alert('Could not save', res.error.message);
      return;
    }
    Alert.alert('Saved', 'Your provider profile has been updated.');
  }, [
    providerId,
    bio,
    coverage,
    radius,
    workingHours,
    timezone,
    maxJobs,
    bufferBefore,
    bufferAfter,
  ]);

  const handleAddTimeOff = useCallback(
    async (block: {
      startsAt: string;
      endsAt: string;
      reason: string | null;
    }): Promise<void> => {
      if (!providerId) return;
      setTimeOffBusy(true);
      const res = await insertProviderTimeOff({
        provider_id: providerId,
        starts_at: block.startsAt,
        ends_at: block.endsAt,
        reason: block.reason,
      });
      setTimeOffBusy(false);

      if (res.error) {
        // A double-submitted vacation is not a race with a customer, so it gets
        // its own copy rather than "that time was just taken".
        Alert.alert(
          isTimeOffOverlapError(res.error)
            ? 'Already blocked'
            : 'Could not add time off',
          res.error.message,
        );
        return;
      }
      setTimeOff((current) =>
        [...current, res.data].sort((a, b) =>
          a.starts_at.localeCompare(b.starts_at),
        ),
      );
    },
    [providerId],
  );

  const handleModifierChange = useCallback(
    async (
      factorType: FactorType,
      factorValue: string,
      deltaMins: number | null,
    ): Promise<void> => {
      if (!providerId) return;
      setModifiersBusy(true);

      if (deltaMins === null) {
        const existing = modifiers.find(
          (m) => m.factor_type === factorType && m.factor_value === factorValue,
        );
        if (!existing) {
          setModifiersBusy(false);
          return;
        }
        const res = await deleteServiceDurationModifier(existing.id);
        setModifiersBusy(false);
        if (res.error) {
          Alert.alert('Could not clear that', res.error.message);
          return;
        }
        setModifiers((current) => current.filter((m) => m.id !== existing.id));
        return;
      }

      // Upsert rather than insert: the unique constraint means a second row for
      // the same factor value is never what the provider meant — they meant to
      // change the number they already set.
      const res = await upsertServiceDurationModifier({
        provider_id: providerId,
        factor_type: factorType,
        factor_value: factorValue,
        delta_mins: deltaMins,
      });
      setModifiersBusy(false);
      if (res.error) {
        Alert.alert('Could not save that', res.error.message);
        return;
      }
      setModifiers((current) => {
        const without = current.filter(
          (m) =>
            !(m.factor_type === factorType && m.factor_value === factorValue),
        );
        return [...without, res.data];
      });
    },
    [providerId, modifiers],
  );

  const handleRemoveTimeOff = useCallback(
    async (id: string): Promise<void> => {
      setTimeOffBusy(true);
      const res = await deleteProviderTimeOff(id);
      setTimeOffBusy(false);
      if (res.error) {
        Alert.alert('Could not remove time off', res.error.message);
        return;
      }
      setTimeOff((current) => current.filter((block) => block.id !== id));
    },
    [],
  );

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
          Time zone
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          Your working hours are local times, so this decides what they mean.
        </Text>
        <Spacer size="xs" />
        <TimezoneField value={timezone} onChange={setTimezone} />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Working hours
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          {describeWorkingHours(workingHours)}
        </Text>
        <Spacer size="sm" />
        <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Between jobs
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          Setup and travel time reserved around each job. Existing jobs keep the
          buffers they were booked with.
        </Text>
        <Spacer size="sm" />
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <TextField
              label="Before (min)"
              value={bufferBefore}
              onChangeText={setBufferBefore}
              placeholder="15"
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={styles.fieldHalf}>
            <TextField
              label="After (min)"
              value={bufferAfter}
              onChangeText={setBufferAfter}
              placeholder="30"
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
        </View>
        <Spacer size="md" />
        <TextField
          label="Max jobs per day"
          value={maxJobs}
          onChangeText={setMaxJobs}
          placeholder="No limit"
          keyboardType="number-pad"
          maxLength={2}
          hint="Leave blank for no limit."
        />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Job length adjustments
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          How much longer a job takes for a given vehicle or condition. Used to
          suggest a duration; you always set the final one. Saved immediately.
        </Text>
        <Spacer size="sm" />
        <DurationModifierEditor
          modifiers={modifiers}
          onChange={handleModifierChange}
          isBusy={modifiersBusy}
        />

        <Spacer size="lg" />
        <Text variant="label" color="charcoal">
          Time off
        </Text>
        <Spacer size="xs" />
        <Text variant="caption" color="midGray">
          Days you are not available. Saved immediately.
        </Text>
        <Spacer size="sm" />
        <TimeOffEditor
          blocks={timeOff}
          timeZone={timezone}
          isBusy={timeOffBusy}
          onAdd={handleAddTimeOff}
          onRemove={handleRemoveTimeOff}
        />

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
          Service changes and time off save instantly. Tap Save to update your
          profile, hours and buffers.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.base },
  centeredText: { textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
});
