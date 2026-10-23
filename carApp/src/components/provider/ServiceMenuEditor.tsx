// ServiceMenuEditor (Flows 4.7 / 5.3) — lets a provider manage their service
// menu: list packages and add / edit / delete them. Prices are entered in
// dollars and stored as integer cents to match the rest of the app
// (money.ts, bookings). New/edited packages are created as custom and may be
// pending admin approval, so this uses the owner-facing query that returns
// unapproved rows too.
//
// Phase 3 (spec §4): a main service may carry a tier (basic / standard /
// premium) and an advertised duration range ("2–3 hrs"); an add-on is a
// package attached to one of the provider's main services. The 'addon'
// category is gone — migration 20260822000000 retired it and models add-ons
// structurally — and an add-on takes its main service's category.

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
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { TextField } from '../ui/TextField';
import { Sheet } from '../ui/Sheet';
import { colors, spacing, type Palette } from '../../design/tokens';
import { centsToDisplay, displayToCents } from '../../utils/money';
import { getProviderOwnServicePackages } from '../../lib/supabase/queries';
import {
  PACKAGE_TIERS,
  TIER_LABELS,
  isAddOn,
  isPackageTier,
  type PackageTier,
} from '../../utils/packages';
import {
  deleteServicePackage,
  insertServicePackage,
  updateServicePackage,
} from '../../lib/supabase/mutations';
import type { ServicePackage } from '../../types/models';

type Category = 'detailing' | 'mechanical';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'detailing', label: 'Detailing' },
  { value: 'mechanical', label: 'Mechanical' },
];

export interface ServiceMenuEditorProps {
  providerId: string;
  /** Called after any successful add/edit/delete so hosts can refresh. */
  onChanged?: () => void;
}

interface DraftFields {
  name: string;
  category: Category;
  price: string; // dollars as entered
  duration: string; // minutes
  /** Advertised range, minutes. Both or neither (service_packages_duration_range_check). */
  durationMin: string;
  durationMax: string;
  description: string;
  tier: PackageTier | null;
  /** Set when this package is an add-on to one of the provider's main services. */
  parentId: string | null;
}

const EMPTY: DraftFields = {
  name: '',
  category: 'detailing',
  price: '',
  duration: '',
  durationMin: '',
  durationMax: '',
  description: '',
  tier: null,
  parentId: null,
};

// service_packages.base_price is NUMERIC(10,2) holding WHOLE DOLLARS (69.00),
// not cents — the customer side reads it that way everywhere (bookingDraft,
// the provider detail screen, the booking screen all do `base_price * 100`).
// Convert at the edges of this editor: dollars in from the row, cents for
// display/validation, dollars back out on save.
function priceCents(pkg: ServicePackage): number | null {
  return pkg.base_price != null ? Math.round(Number(pkg.base_price) * 100) : null;
}

function toDraft(pkg: ServicePackage): DraftFields {
  return {
    name: pkg.name ?? '',
    category: pkg.category === 'mechanical' ? 'mechanical' : 'detailing',
    price: pkg.base_price != null ? Number(pkg.base_price).toFixed(2) : '',
    duration: pkg.duration_mins != null ? String(pkg.duration_mins) : '',
    durationMin: pkg.duration_min_mins != null ? String(pkg.duration_min_mins) : '',
    durationMax: pkg.duration_max_mins != null ? String(pkg.duration_max_mins) : '',
    description: pkg.description ?? '',
    tier: isPackageTier(pkg.tier) ? pkg.tier : null,
    parentId: pkg.parent_package_id ?? null,
  };
}

/** '' → null; anything else must be a positive whole number of minutes. */
function parseOptionalMins(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value > 0 && String(value) === trimmed ? value : 'invalid';
}

export function ServiceMenuEditor({
  providerId,
  onChanged,
}: ServiceMenuEditorProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorVisible, setEditorVisible] = useState(false);
  const [target, setTarget] = useState<ServicePackage | null>(null);
  const [draft, setDraft] = useState<DraftFields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const res = await getProviderOwnServicePackages(providerId);
    if (!res.error) setPackages(res.data ?? []);
    setLoading(false);
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = useCallback(() => {
    setTarget(null);
    setDraft(EMPTY);
    setError(null);
    setEditorVisible(true);
  }, []);

  const openEdit = useCallback((pkg: ServicePackage) => {
    setTarget(pkg);
    setDraft(toDraft(pkg));
    setError(null);
    setEditorVisible(true);
  }, []);

  const patch = useCallback(
    <K extends keyof DraftFields>(field: K, value: DraftFields[K]) =>
      setDraft((d) => ({ ...d, [field]: value })),
    [],
  );

  // Main services this package could attach to: not itself, not an add-on
  // (one level deep), and not when it already has add-ons of its own — the
  // database refuses all three.
  const hasAddOns = target !== null && packages.some((p) => p.parent_package_id === target.id);
  const parentOptions = packages.filter((p) => !isAddOn(p) && p.id !== target?.id);
  const parentName = useCallback(
    (id: string | null) => packages.find((p) => p.id === id)?.name ?? null,
    [packages],
  );

  const handleSave = useCallback(async (): Promise<void> => {
    const name = draft.name.trim();
    const cents = displayToCents(draft.price);
    const duration = parseInt(draft.duration, 10);
    if (!name) return setError('Name is required.');
    if (!Number.isFinite(cents) || cents <= 0) return setError('Enter a valid price.');
    if (!Number.isFinite(duration) || duration <= 0)
      return setError('Enter a duration in minutes.');

    const rangeMin = parseOptionalMins(draft.durationMin);
    const rangeMax = parseOptionalMins(draft.durationMax);
    if (rangeMin === 'invalid' || rangeMax === 'invalid')
      return setError('Enter the time range in whole minutes.');
    if ((rangeMin === null) !== (rangeMax === null))
      return setError('Enter both ends of the time range, or neither.');
    if (rangeMin !== null && rangeMax !== null && rangeMin > rangeMax)
      return setError('The shortest time cannot be longer than the longest.');

    const parent = draft.parentId ? packages.find((p) => p.id === draft.parentId) : null;

    setSaving(true);
    setError(null);
    const fields = {
      name,
      // An add-on takes its main service's category (the hierarchy trigger
      // enforces it; stating it here keeps the row honest before the trigger).
      category: parent?.category === 'mechanical' ? 'mechanical' : parent ? 'detailing' : draft.category,
      // Parsed as cents so "69.9" can't land as a float artifact, stored as
      // the dollars the column (and the customer side) expects.
      base_price: cents / 100,
      duration_mins: duration,
      duration_min_mins: rangeMin,
      duration_max_mins: rangeMax,
      description: draft.description.trim() || null,
      // Add-ons are untiered (service_packages_addon_shape_check).
      tier: parent ? null : draft.tier,
      parent_package_id: parent ? parent.id : null,
    };
    const res = target
      ? await updateServicePackage(target.id, fields)
      : await insertServicePackage({
          provider_id: providerId,
          is_custom: true,
          ...fields,
        });
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setEditorVisible(false);
    await load();
    onChanged?.();
  }, [draft, target, providerId, packages, load, onChanged]);

  const handleDelete = useCallback(
    (pkg: ServicePackage) => {
      Alert.alert('Remove service?', `"${pkg.name}" will be removed from your menu.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteServicePackage(pkg.id);
            if (res.error) {
              Alert.alert('Could not remove', res.error.message);
              return;
            }
            await load();
            onChanged?.();
          },
        },
      ]);
    },
    [load, onChanged],
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.electricBlue} />
      </View>
    );
  }

  return (
    <View>
      {packages.length === 0 ? (
        <Card variant="outlined">
          <Text variant="body" color="midGray">
            No services yet. Add the services you offer and what they cost.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {packages.map((pkg) => (
            <Card key={pkg.id}>
              <View style={styles.row}>
                <Text variant="label" color="charcoal" style={styles.flex} numberOfLines={1}>
                  {pkg.name}
                </Text>
                {isPackageTier(pkg.tier) ? (
                  <View style={[styles.pill, { backgroundColor: palette.deepIndigo + '1A' }]}>
                    <Text variant="caption" style={{ color: palette.deepIndigo }}>
                      {TIER_LABELS[pkg.tier]}
                    </Text>
                  </View>
                ) : null}
                {!pkg.is_approved ? (
                  <View style={[styles.pill, { backgroundColor: palette.gearGold + '22' }]}>
                    <Text variant="caption" style={{ color: palette.gearGold }}>
                      Pending review
                    </Text>
                  </View>
                ) : null}
              </View>
              <Spacer size="xs" />
              <Text variant="bodySmall" color="midGray">
                {(() => {
                  const cents = priceCents(pkg);
                  return cents != null ? centsToDisplay(cents) : '—';
                })()}
                {pkg.duration_mins != null ? ` · ${pkg.duration_mins} min` : ''}
                {pkg.duration_min_mins != null && pkg.duration_max_mins != null
                  ? ` (${pkg.duration_min_mins}–${pkg.duration_max_mins} min)`
                  : ''}
              </Text>
              {isAddOn(pkg) ? (
                <Text variant="caption" color="midGray">
                  Add-on to {parentName(pkg.parent_package_id) ?? 'a removed service'}
                </Text>
              ) : null}
              <Spacer size="sm" />
              <View style={styles.actions}>
                <Spacer flex />
                <Pressable
                  onPress={() => openEdit(pkg)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${pkg.name}`}
                  style={styles.iconBtn}
                  testID={`service-edit-${pkg.id}`}
                >
                  <Pencil size={16} color={palette.midGray} strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(pkg)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${pkg.name}`}
                  style={styles.iconBtn}
                  testID={`service-delete-${pkg.id}`}
                >
                  <Trash2 size={16} color="#E74C3C" strokeWidth={2} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Spacer size="md" />
      <Button
        label="Add a service"
        variant="secondary"
        size="md"
        leftIcon={<Plus size={16} color={palette.electricBlue} strokeWidth={2.5} />}
        onPress={openAdd}
        testID="service-add"
      />

      <Sheet
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        title={target ? 'Edit service' : 'Add service'}
        accessibilityLabel="Service editor"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <TextField
              label="Service name"
              value={draft.name}
              onChangeText={(v) => patch('name', v)}
              placeholder="Full Interior Detail"
              autoCapitalize="words"
            />

            <View>
              <Text variant="label" color="charcoal" style={styles.fieldLabel}>
                Add-on to
              </Text>
              {hasAddOns ? (
                <Text variant="caption" color="midGray">
                  This service has add-ons of its own, so it stays a main service.
                </Text>
              ) : (
                <View style={styles.categoryRow}>
                  {[{ id: null as string | null, name: 'None — main service' }, ...parentOptions].map(
                    (option) => {
                      const selected = draft.parentId === option.id;
                      return (
                        <Chip
                          key={option.id ?? 'none'}
                          label={option.name}
                          selected={selected}
                          onPress={() => patch('parentId', option.id)}
                          testID={`service-parent-${option.id ?? 'none'}`}
                          palette={palette}
                        />
                      );
                    },
                  )}
                </View>
              )}
            </View>

            {draft.parentId === null && (
              <>
                <View>
                  <Text variant="label" color="charcoal" style={styles.fieldLabel}>
                    Category
                  </Text>
                  <View style={styles.categoryRow}>
                    {CATEGORIES.map((c) => (
                      <Chip
                        key={c.value}
                        label={c.label}
                        selected={draft.category === c.value}
                        onPress={() => patch('category', c.value)}
                        testID={`service-category-${c.value}`}
                        palette={palette}
                        role="radio"
                      />
                    ))}
                  </View>
                </View>

                <View>
                  <Text variant="label" color="charcoal" style={styles.fieldLabel}>
                    Tier
                  </Text>
                  <View style={styles.categoryRow}>
                    {[null, ...PACKAGE_TIERS].map((tier) => (
                      <Chip
                        key={tier ?? 'none'}
                        label={tier ? TIER_LABELS[tier] : 'None'}
                        selected={draft.tier === tier}
                        onPress={() => patch('tier', tier)}
                        testID={`service-tier-${tier ?? 'none'}`}
                        palette={palette}
                        role="radio"
                      />
                    ))}
                  </View>
                </View>
              </>
            )}

            <TextField
              label="Price (USD)"
              value={draft.price}
              onChangeText={(v) => patch('price', v)}
              placeholder="150"
              keyboardType="decimal-pad"
            />
            <TextField
              label="Duration (minutes)"
              value={draft.duration}
              onChangeText={(v) => patch('duration', v)}
              placeholder="120"
              keyboardType="number-pad"
            />
            {/* Optional advertised range. What customers see as "2–3 hrs";
                the duration above stays the figure the suggestion uses. */}
            <View style={styles.rangeRow}>
              <View style={styles.flex}>
                <TextField
                  label="Shortest (minutes)"
                  value={draft.durationMin}
                  onChangeText={(v) => patch('durationMin', v)}
                  placeholder="Optional"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  label="Longest (minutes)"
                  value={draft.durationMax}
                  onChangeText={(v) => patch('durationMax', v)}
                  placeholder="Optional"
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <TextField
              label="Description"
              value={draft.description}
              onChangeText={(v) => patch('description', v)}
              placeholder="What's included…"
              multiline
              error={error ?? undefined}
            />

            <Button
              label={target ? 'Save service' : 'Add service'}
              variant="primary"
              size="lg"
              loading={saving}
              onPress={handleSave}
              testID="service-save"
            />
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

export default ServiceMenuEditor;

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  palette: Palette;
  role?: 'radio' | 'button';
}

function Chip({ label, selected, onPress, testID, palette, role = 'button' }: ChipProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.categoryChip,
        {
          borderColor: selected ? palette.electricBlue : palette.midGray,
          backgroundColor: selected ? palette.electricBlue + '14' : 'transparent',
        },
      ]}
    >
      <Text variant="caption" style={{ color: selected ? palette.electricBlue : palette.charcoal }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { gap: spacing.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 20 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.md, paddingBottom: spacing.base },
  fieldLabel: { marginBottom: spacing.xs },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rangeRow: { flexDirection: 'row', gap: spacing.sm },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
  },
});
