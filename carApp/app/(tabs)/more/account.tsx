// Account screen (Flows 3.1 + 3.2) — lets a customer edit their profile
// (display name + avatar photo) and manage their garage of vehicles
// (add / edit / delete / set primary).
//
// Profile edits persist to the `users` row via updateUser and are mirrored
// back into the auth store so the rest of the app reflects them immediately.
// Vehicles use the full vehicles CRUD in the data layer. Avatar selection
// goes through expo-image-picker → storage.uploadAvatar → updateUser.
//
// NOTE: avatar capture needs the expo-image-picker native module, so it only
// works in a dev client / built app. Client-side resize to 1920px (per
// CLAUDE.md) needs expo-image-manipulator, which is not yet an approved
// dependency — we constrain quality to 0.8 via the picker for now.

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
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Car,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { TextField } from '../../../src/components/ui/TextField';
import { Sheet } from '../../../src/components/ui/Sheet';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import { getVehiclesByUser } from '../../../src/lib/supabase/queries';
import {
  deleteVehicle,
  insertVehicle,
  updateUser,
  updateVehicle,
} from '../../../src/lib/supabase/mutations';
import { uploadAvatar } from '../../../src/lib/supabase/storage';
import {
  isValidLicensePlate,
  isValidVehicleMake,
  isValidVehicleModel,
  isValidVehicleYear,
} from '../../../src/utils/validators';
import type { Vehicle } from '../../../src/types/models';

// ── Vehicle editor sheet ───────────────────────────────────────────────────

interface VehicleDraftFields {
  year: string;
  make: string;
  model: string;
  trim: string;
  color: string;
  licensePlate: string;
}

const EMPTY_DRAFT: VehicleDraftFields = {
  year: '',
  make: '',
  model: '',
  trim: '',
  color: '',
  licensePlate: '',
};

function vehicleToDraft(v: Vehicle): VehicleDraftFields {
  return {
    year: v.year ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    trim: v.trim ?? '',
    color: v.color ?? '',
    licensePlate: v.license_plate ?? '',
  };
}

interface VehicleEditorSheetProps {
  visible: boolean;
  initial: Vehicle | null;
  userId: string;
  /** When inserting the first vehicle, mark it primary automatically. */
  makePrimaryOnInsert: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function VehicleEditorSheet({
  visible,
  initial,
  userId,
  makePrimaryOnInsert,
  onClose,
  onSaved,
}: VehicleEditorSheetProps): React.ReactElement {
  const [draft, setDraft] = useState<VehicleDraftFields>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the sheet opens for a new target.
  useEffect(() => {
    if (visible) {
      setDraft(initial ? vehicleToDraft(initial) : EMPTY_DRAFT);
      setError(null);
    }
  }, [visible, initial]);

  function patch(field: keyof VehicleDraftFields, value: string): void {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function validate(): string | null {
    const year = isValidVehicleYear(draft.year);
    if (!year.valid) return year.error;
    const make = isValidVehicleMake(draft.make);
    if (!make.valid) return make.error;
    const model = isValidVehicleModel(draft.model);
    if (!model.valid) return model.error;
    if (draft.licensePlate.trim()) {
      const plate = isValidLicensePlate(draft.licensePlate);
      if (!plate.valid) return plate.error;
    }
    return null;
  }

  async function handleSave(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);

    const fields = {
      year: draft.year.trim(),
      make: draft.make.trim(),
      model: draft.model.trim(),
      trim: draft.trim.trim() || null,
      color: draft.color.trim() || null,
      license_plate: draft.licensePlate.trim() || null,
    };

    const result = initial
      ? await updateVehicle(initial.id, fields)
      : await insertVehicle({
          user_id: userId,
          ...fields,
          is_primary: makePrimaryOnInsert,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={initial ? 'Edit vehicle' : 'Add vehicle'}
      accessibilityLabel="Vehicle editor"
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.formGap}>
          <TextField
            label="Year *"
            value={draft.year}
            onChangeText={(v) => patch('year', v)}
            placeholder="2022"
            keyboardType="number-pad"
            maxLength={4}
          />
          <TextField
            label="Make *"
            value={draft.make}
            onChangeText={(v) => patch('make', v)}
            placeholder="Honda"
            autoCapitalize="words"
          />
          <TextField
            label="Model *"
            value={draft.model}
            onChangeText={(v) => patch('model', v)}
            placeholder="Civic"
            autoCapitalize="words"
          />
          <TextField
            label="Trim"
            value={draft.trim}
            onChangeText={(v) => patch('trim', v)}
            placeholder="EX-L"
            autoCapitalize="words"
          />
          <TextField
            label="Color"
            value={draft.color}
            onChangeText={(v) => patch('color', v)}
            placeholder="Silver"
            autoCapitalize="words"
          />
          <TextField
            label="License plate"
            value={draft.licensePlate}
            onChangeText={(v) => patch('licensePlate', v)}
            placeholder="ABC-1234"
            autoCapitalize="characters"
            maxLength={10}
            error={error ?? undefined}
          />

          <Button
            label={initial ? 'Save changes' : 'Add vehicle'}
            variant="primary"
            size="lg"
            loading={saving}
            onPress={handleSave}
            testID="vehicle-editor-save"
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AccountScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const [name, setName] = useState(user?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [vehicleError, setVehicleError] = useState<Error | null>(null);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorTarget, setEditorTarget] = useState<Vehicle | null>(null);

  const nameChanged = name.trim() !== (user?.full_name ?? '').trim();
  const nameValid = name.trim().length > 0;

  // ── Vehicles ───────────────────────────────────────────────────────────

  const fetchVehicles = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoadingVehicles(true);
    setVehicleError(null);
    const result = await getVehiclesByUser(user.id);
    if (result.error) setVehicleError(result.error);
    else setVehicles(result.data ?? []);
    setLoadingVehicles(false);
  }, [user]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // ── Profile name ─────────────────────────────────────────────────────────

  const handleSaveName = useCallback(async (): Promise<void> => {
    if (!user || !session || !nameValid) return;
    setSavingName(true);
    const result = await updateUser(user.id, { full_name: name.trim() });
    setSavingName(false);
    if (result.error || !result.data) {
      Alert.alert('Could not save', result.error?.message ?? 'Please try again.');
      return;
    }
    setSession(session, result.data);
  }, [user, session, name, nameValid, setSession]);

  // ── Avatar ─────────────────────────────────────────────────────────────

  const handleChangeAvatar = useCallback(async (): Promise<void> => {
    if (!user || !session) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo library access to update your profile picture.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const fileSize = blob.size || asset.fileSize || 0;

      const upload = await uploadAvatar(user.id, blob, mimeType, fileSize);
      if (upload.error || !upload.data) {
        Alert.alert(
          'Upload failed',
          upload.error?.message ?? 'Could not upload your photo.',
        );
        return;
      }

      // Cache-bust so the freshly uploaded image (same storage path) renders.
      const bustedUrl = `${upload.data}?t=${Date.now()}`;
      const updated = await updateUser(user.id, { avatar_url: bustedUrl });
      if (updated.error || !updated.data) {
        Alert.alert(
          'Could not save',
          updated.error?.message ?? 'Photo uploaded but not saved.',
        );
        return;
      }
      setSession(session, updated.data);
    } catch (err) {
      Alert.alert(
        'Upload failed',
        err instanceof Error ? err.message : 'Unexpected error.',
      );
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, session, setSession]);

  // ── Vehicle actions ──────────────────────────────────────────────────────

  const openAddVehicle = useCallback(() => {
    setEditorTarget(null);
    setEditorVisible(true);
  }, []);

  const openEditVehicle = useCallback((vehicle: Vehicle) => {
    setEditorTarget(vehicle);
    setEditorVisible(true);
  }, []);

  const handleDeleteVehicle = useCallback(
    (vehicle: Vehicle) => {
      Alert.alert(
        'Remove vehicle?',
        `${vehicle.year} ${vehicle.make} ${vehicle.model} will be removed from your garage.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const result = await deleteVehicle(vehicle.id);
              if (result.error) {
                Alert.alert('Could not remove', result.error.message);
                return;
              }
              fetchVehicles();
            },
          },
        ],
      );
    },
    [fetchVehicles],
  );

  const handleMakePrimary = useCallback(
    async (vehicle: Vehicle) => {
      const currentPrimary = vehicles.find(
        (v) => v.is_primary && v.id !== vehicle.id,
      );
      const result = await updateVehicle(vehicle.id, { is_primary: true });
      if (result.error) {
        Alert.alert('Could not update', result.error.message);
        return;
      }
      if (currentPrimary) {
        await updateVehicle(currentPrimary.id, { is_primary: false });
      }
      fetchVehicles();
    },
    [vehicles, fetchVehicles],
  );

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderVehicles(): React.ReactNode {
    if (loadingVehicles) {
      return (
        <View style={styles.vehiclesPlaceholder}>
          <ActivityIndicator color={palette.electricBlue} />
        </View>
      );
    }
    if (vehicleError) {
      return (
        <Card variant="outlined">
          <Text variant="body" color="charcoal">
            Could not load your vehicles.
          </Text>
          <Spacer size="sm" />
          <Button
            label="Retry"
            variant="secondary"
            size="sm"
            onPress={fetchVehicles}
          />
        </Card>
      );
    }
    if (vehicles.length === 0) {
      return (
        <Card variant="outlined">
          <Text variant="body" color="midGray">
            No vehicles yet. Add the car you want serviced.
          </Text>
        </Card>
      );
    }
    return vehicles.map((vehicle) => {
      const subtitleParts = [
        vehicle.trim,
        vehicle.color,
        vehicle.license_plate,
      ].filter((p): p is string => Boolean(p && p.trim()));
      return (
        <Card key={vehicle.id}>
          <View style={styles.vehicleHeader}>
            <Car size={18} color={palette.deepIndigo} strokeWidth={2} />
            <Spacer size="sm" horizontal />
            <Text
              variant="label"
              color="charcoal"
              style={styles.flex}
              numberOfLines={1}
            >
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Text>
            {vehicle.is_primary ? (
              <View
                style={[
                  styles.primaryPill,
                  { backgroundColor: palette.gearGold + '22' },
                ]}
              >
                <Star size={11} color={palette.gearGold} strokeWidth={2.5} />
                <Text variant="caption" style={{ color: palette.gearGold }}>
                  Primary
                </Text>
              </View>
            ) : null}
          </View>

          {subtitleParts.length > 0 ? (
            <>
              <Spacer size="xs" />
              <Text variant="bodySmall" color="midGray" numberOfLines={1}>
                {subtitleParts.join(' · ')}
              </Text>
            </>
          ) : null}

          <Spacer size="sm" />
          <View style={styles.vehicleActions}>
            {!vehicle.is_primary ? (
              <Pressable
                onPress={() => handleMakePrimary(vehicle)}
                accessibilityRole="button"
                accessibilityLabel={`Make ${vehicle.make} ${vehicle.model} primary`}
                style={styles.actionBtn}
                testID={`vehicle-primary-${vehicle.id}`}
              >
                <Text variant="caption" style={{ color: palette.electricBlue }}>
                  Make primary
                </Text>
              </Pressable>
            ) : null}
            <Spacer flex />
            <Pressable
              onPress={() => openEditVehicle(vehicle)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${vehicle.make} ${vehicle.model}`}
              style={styles.iconBtn}
              testID={`vehicle-edit-${vehicle.id}`}
            >
              <Pencil size={16} color={palette.midGray} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => handleDeleteVehicle(vehicle)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${vehicle.make} ${vehicle.model}`}
              style={styles.iconBtn}
              testID={`vehicle-delete-${vehicle.id}`}
            >
              <Trash2 size={16} color="#E74C3C" strokeWidth={2} />
            </Pressable>
          </View>
        </Card>
      );
    });
  }

  const contactEmail = user?.email ?? 'Not added';
  const contactPhone = user?.phone ?? 'Not added';

  return (
    <ScrollView
      style={{ backgroundColor: palette.offWhite }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Avatar */}
      <View style={styles.avatarBlock}>
        <Pressable
          onPress={handleChangeAvatar}
          disabled={uploadingAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          testID="account-change-avatar"
        >
          <Avatar
            uri={user?.avatar_url}
            name={user?.full_name ?? 'You'}
            size="xl"
          />
          <View
            style={[styles.cameraBadge, { backgroundColor: palette.deepIndigo }]}
          >
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Camera size={16} color="#FFFFFF" strokeWidth={2} />
            )}
          </View>
        </Pressable>
      </View>

      <Spacer size="lg" />

      {/* Name */}
      <TextField
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoCapitalize="words"
      />
      {nameChanged ? (
        <>
          <Spacer size="sm" />
          <Button
            label="Save name"
            variant="primary"
            size="md"
            disabled={!nameValid}
            loading={savingName}
            onPress={handleSaveName}
            testID="account-save-name"
          />
        </>
      ) : null}

      <Spacer size="lg" />

      {/* Contact methods (read-only) */}
      <Text variant="label" color="midGray" style={styles.sectionLabel}>
        CONTACT
      </Text>
      <Card variant="outlined">
        <View style={styles.contactRow}>
          <Text variant="bodySmall" color="midGray">
            Email
          </Text>
          <Text variant="body" color="charcoal" numberOfLines={1}>
            {contactEmail}
          </Text>
        </View>
        <View style={styles.contactDivider} />
        <View style={styles.contactRow}>
          <Text variant="bodySmall" color="midGray">
            Phone
          </Text>
          <Text variant="body" color="charcoal" numberOfLines={1}>
            {contactPhone}
          </Text>
        </View>
      </Card>

      <Spacer size="lg" />

      {/* Vehicles */}
      <View style={styles.vehiclesHeader}>
        <Text variant="label" color="midGray" style={styles.sectionLabel}>
          VEHICLES
        </Text>
        <Spacer flex />
        <Pressable
          onPress={openAddVehicle}
          accessibilityRole="button"
          accessibilityLabel="Add a vehicle"
          style={styles.addBtn}
          testID="account-add-vehicle"
        >
          <Plus size={16} color={palette.electricBlue} strokeWidth={2.5} />
          <Text variant="label" style={{ color: palette.electricBlue }}>
            Add
          </Text>
        </Pressable>
      </View>

      <View style={styles.vehiclesList}>{renderVehicles()}</View>

      {user ? (
        <VehicleEditorSheet
          visible={editorVisible}
          initial={editorTarget}
          userId={user.id}
          makePrimaryOnInsert={vehicles.length === 0}
          onClose={() => setEditorVisible(false)}
          onSaved={fetchVehicles}
        />
      ) : null}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  flex: {
    flex: 1,
  },
  avatarBlock: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    letterSpacing: 0.6,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  contactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(119,119,119,0.3)',
    marginVertical: spacing.sm,
  },
  vehiclesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  vehiclesList: {
    gap: spacing.md,
  },
  vehiclesPlaceholder: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    marginLeft: spacing.sm,
  },
  vehicleActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formGap: {
    gap: spacing.md,
    paddingBottom: spacing.base,
  },
});
