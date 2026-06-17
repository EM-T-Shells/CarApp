// ServiceMenuEditor (Flows 4.7 / 5.3) — lets a provider manage their service
// menu: list packages and add / edit / delete them. Prices are entered in
// dollars and stored as integer cents to match the rest of the app
// (money.ts, bookings). New/edited packages are created as custom and may be
// pending admin approval, so this uses the owner-facing query that returns
// unapproved rows too.

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
import { colors, spacing } from '../../design/tokens';
import { centsToDisplay, displayToCents } from '../../utils/money';
import { getProviderOwnServicePackages } from '../../lib/supabase/queries';
import {
  deleteServicePackage,
  insertServicePackage,
  updateServicePackage,
} from '../../lib/supabase/mutations';
import type { ServicePackage } from '../../types/models';

type Category = 'detailing' | 'mechanical' | 'addon';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'detailing', label: 'Detailing' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'addon', label: 'Add-on' },
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
  description: string;
}

const EMPTY: DraftFields = {
  name: '',
  category: 'detailing',
  price: '',
  duration: '',
  description: '',
};

function toDraft(pkg: ServicePackage): DraftFields {
  return {
    name: pkg.name ?? '',
    category: (pkg.category as Category) ?? 'detailing',
    price: pkg.base_price != null ? String(pkg.base_price / 100) : '',
    duration: pkg.duration_mins != null ? String(pkg.duration_mins) : '',
    description: pkg.description ?? '',
  };
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
    (field: keyof DraftFields, value: string) =>
      setDraft((d) => ({ ...d, [field]: value })),
    [],
  );

  const handleSave = useCallback(async (): Promise<void> => {
    const name = draft.name.trim();
    const cents = displayToCents(draft.price);
    const duration = parseInt(draft.duration, 10);
    if (!name) return setError('Name is required.');
    if (!Number.isFinite(cents) || cents <= 0) return setError('Enter a valid price.');
    if (!Number.isFinite(duration) || duration <= 0)
      return setError('Enter a duration in minutes.');

    setSaving(true);
    setError(null);
    const fields = {
      name,
      category: draft.category,
      base_price: cents,
      duration_mins: duration,
      description: draft.description.trim() || null,
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
  }, [draft, target, providerId, load, onChanged]);

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
                {pkg.base_price != null ? centsToDisplay(pkg.base_price) : '—'}
                {pkg.duration_mins != null ? ` · ${pkg.duration_mins} min` : ''}
              </Text>
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
                Category
              </Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.map((c) => {
                  const selected = draft.category === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => patch('category', c.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={c.label}
                      testID={`service-category-${c.value}`}
                      style={[
                        styles.categoryChip,
                        {
                          borderColor: selected ? palette.electricBlue : palette.midGray,
                          backgroundColor: selected ? palette.electricBlue + '14' : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={{ color: selected ? palette.electricBlue : palette.charcoal }}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

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
  categoryRow: { flexDirection: 'row', gap: spacing.sm },
  categoryChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
  },
});
