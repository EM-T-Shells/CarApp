// IntakePhotoUploader — the customer's photos for a quote request (spec §3:
// "guided photo upload"; §7 "photos unusable").
//
// Controlled and storage-agnostic: the host owns the list and decides what
// "add" means. The booking screen holds picked photos in the draft store,
// because a booking_photos row needs a booking and none exists until "Send
// Request"; the booking detail screen uploads straight away, because by then
// it does. Both use uploadIntakePhoto below for the actual write.
//
// Compression: quality 0.8 at pick time, the same as JobPhotoCapture.
// expo-image-manipulator (needed for the 1920px resize) is not on the approved
// dependency list, so the 10 MB cap in storage.ts is the size guard.
//
// Storage: the booking-photos bucket is private. As in JobPhotoCapture, a
// long-lived signed URL is stored in storage_url so both participants'
// galleries can render it without a public bucket.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Plus, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { getSignedUrl, uploadBookingPhoto } from '../../lib/supabase/storage';
import { insertBookingPhoto, type MutationResult } from '../../lib/supabase/mutations';
import type { BookingPhoto } from '../../types/models';

/** Same lifetime JobPhotoCapture uses: the life of a booking record. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

/** Enough to show the car; more is noise for the provider to scroll through. */
export const MAX_INTAKE_PHOTOS = 8;

/** The shots that let a provider price a job without seeing the car. */
export const SUGGESTED_SHOTS = [
  'The whole car, driver side',
  'Front seats',
  'Back seats',
  'Trunk or cargo area',
  'Anything you are worried about',
] as const;

export interface PickedPhoto {
  uri: string;
  mimeType: string;
  fileSize: number;
}

export interface IntakePhotoItem {
  key: string;
  uri: string;
}

export interface IntakePhotoUploaderProps {
  photos: IntakePhotoItem[];
  /** Receives each picked photo. May be async; the add tile spins until it settles. */
  onAdd: (photo: PickedPhoto) => void | Promise<void>;
  /** Omit where photos cannot be removed (an uploaded intake photo is evidence). */
  onRemove?: (key: string) => void;
  disabled?: boolean;
  max?: number;
}

/**
 * Ask for permission and open the camera or library. Resolves null when the
 * person backs out or refuses access; the refusal is explained here so every
 * caller does not have to.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    const title = source === 'camera' ? 'Camera access needed' : 'Photo access needed';
    if (permission.canAskAgain === false) {
      Alert.alert(title, 'Turn access on for CarApp in Settings to add photos.', [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    } else {
      Alert.alert(title, 'Allow access to add photos of your car.');
    }
    return null;
  }

  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const asset = picked.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileSize: asset.fileSize ?? 0,
  };
}

/**
 * Upload one picked photo to a booking and record it as an 'intake' row.
 * "booking_photos: customer insert intake" (20260820000000) is the policy that
 * admits this, and only for the booking's own customer.
 */
export async function uploadIntakePhoto(
  bookingId: string,
  photo: PickedPhoto,
): Promise<MutationResult<BookingPhoto>> {
  try {
    const response = await fetch(photo.uri);
    const blob = await response.blob();
    const fileSize = blob.size || photo.fileSize;

    const upload = await uploadBookingPhoto(bookingId, 'intake', blob, photo.mimeType, fileSize);
    if (upload.error) return { data: null, error: upload.error };

    const signed = await getSignedUrl('booking-photos', upload.data, SIGNED_URL_TTL_SECONDS);

    return await insertBookingPhoto({
      booking_id: bookingId,
      photo_type: 'intake',
      storage_url: signed.data ?? upload.data,
    });
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function IntakePhotoUploader({
  photos,
  onAdd,
  onRemove,
  disabled = false,
  max = MAX_INTAKE_PHOTOS,
}: IntakePhotoUploaderProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const [busy, setBusy] = useState(false);

  const atMax = photos.length >= max;
  const addDisabled = disabled || busy || atMax;

  const add = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        const photo = await pickPhoto(source);
        if (!photo) return;
        setBusy(true);
        await onAdd(photo);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error.';
        // Simulators have no camera; point the tester at the library.
        if (source === 'camera' && /simulator|not available/i.test(message)) {
          Alert.alert('Camera unavailable', 'This device has no camera. Choose from your library instead.');
        } else {
          Alert.alert('Could not add photo', message);
        }
      } finally {
        setBusy(false);
      }
    },
    [onAdd],
  );

  const promptSource = useCallback(() => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take Photo', onPress: () => void add('camera') },
      { text: 'Choose from Library', onPress: () => void add('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [add]);

  return (
    <View>
      <Text variant="label" color="charcoal">
        Photos of your car
      </Text>
      <Text variant="caption" color="midGray">
        They let your provider price the job without seeing it first. Helpful
        shots: {SUGGESTED_SHOTS.join(', ').toLowerCase()}.
      </Text>
      <Spacer size="sm" />

      <View style={styles.row}>
        {photos.map((photo, index) => (
          <View key={photo.key} style={styles.thumbWrap}>
            <Image
              source={{ uri: photo.uri }}
              style={[styles.thumb, { backgroundColor: palette.midGray + '22' }]}
              accessibilityLabel={`Photo ${index + 1} of your car`}
            />
            {onRemove && !disabled && (
              <Pressable
                onPress={() => onRemove(photo.key)}
                style={[styles.remove, { backgroundColor: palette.charcoal }]}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                hitSlop={12}
                testID={`intake-remove-${photo.key}`}
              >
                <X size={12} color={palette.offWhite} strokeWidth={3} />
              </Pressable>
            )}
          </View>
        ))}

        {!atMax && (
          <Pressable
            onPress={promptSource}
            disabled={addDisabled}
            accessibilityRole="button"
            accessibilityLabel="Add a photo of your car"
            accessibilityState={{ disabled: addDisabled, busy }}
            testID="intake-add-photo"
            style={({ pressed }) => [
              styles.addTile,
              { borderColor: palette.midGray, opacity: addDisabled ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={palette.electricBlue} />
            ) : photos.length === 0 ? (
              <Camera size={20} color={palette.midGray} strokeWidth={2} />
            ) : (
              <Plus size={20} color={palette.midGray} strokeWidth={2} />
            )}
          </Pressable>
        )}
      </View>

      <Spacer size="xs" />
      <Text variant="caption" color="midGray" testID="intake-count">
        {photos.length} of {max}
      </Text>
    </View>
  );
}

export default IntakePhotoUploader;

const THUMB = 72;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: THUMB, height: THUMB },
  thumb: { width: THUMB, height: THUMB, borderRadius: borderRadius.input },
  remove: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: THUMB,
    height: THUMB,
    borderRadius: borderRadius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
