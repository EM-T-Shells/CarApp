// JobPhotoCapture (Flow 5.5) — lets a provider capture and upload before/after
// photos during an active job. Uses expo-image-picker (camera or library; the
// camera is the "in-app camera" path), uploads through storage.uploadBookingPhoto,
// then records a booking_photos row.
//
// Storage note: the booking-photos bucket is private (participants only), and
// the shared BookingPhotoGallery renders booking_photos.storage_url directly as
// an image URI. So on upload we resolve a long-lived signed URL and store THAT
// in storage_url — both the provider and customer galleries can then render the
// photo without a public bucket. (A future refactor could store the bare path
// and sign at display time.)

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Plus } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { uploadBookingPhoto, getSignedUrl } from '../../lib/supabase/storage';
import { insertBookingPhoto } from '../../lib/supabase/mutations';
import type { BookingPhoto } from '../../types/models';

// 1-year signed URL — long enough that the gallery keeps working for the life
// of a booking record without re-signing.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

type PhotoType = 'before' | 'after';

export interface JobPhotoCaptureProps {
  bookingId: string;
  photos: BookingPhoto[];
  /** Called after a successful upload so the host can refetch photos. */
  onChanged: () => void;
  /** Disable capture once the job is completed/cancelled. */
  disabled?: boolean;
}

export function JobPhotoCapture({
  bookingId,
  photos,
  onChanged,
  disabled = false,
}: JobPhotoCaptureProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const [uploading, setUploading] = useState<PhotoType | null>(null);

  const before = photos.filter((p) => p.photo_type === 'before');
  const after = photos.filter((p) => p.photo_type === 'after');

  const runUpload = useCallback(
    async (photoType: PhotoType, source: 'camera' | 'library'): Promise<void> => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? 'Camera access needed' : 'Photo access needed',
          'Allow access to add job photos.',
        );
        return;
      }

      const picked =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      setUploading(photoType);
      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const fileSize = blob.size || asset.fileSize || 0;

        const upload = await uploadBookingPhoto(bookingId, photoType, blob, mimeType, fileSize);
        if (upload.error || !upload.data) {
          Alert.alert('Upload failed', upload.error?.message ?? 'Could not upload the photo.');
          return;
        }

        const signed = await getSignedUrl('booking-photos', upload.data, SIGNED_URL_TTL_SECONDS);
        const storageUrl = signed.data ?? upload.data;

        const inserted = await insertBookingPhoto({
          booking_id: bookingId,
          photo_type: photoType,
          storage_url: storageUrl,
        });
        if (inserted.error) {
          Alert.alert('Save failed', inserted.error.message);
          return;
        }
        onChanged();
      } catch (err) {
        Alert.alert('Upload failed', err instanceof Error ? err.message : 'Unexpected error.');
      } finally {
        setUploading(null);
      }
    },
    [bookingId, onChanged],
  );

  const promptSource = useCallback(
    (photoType: PhotoType): void => {
      Alert.alert(`Add ${photoType} photo`, undefined, [
        { text: 'Take Photo', onPress: () => runUpload(photoType, 'camera') },
        { text: 'Choose from Library', onPress: () => runUpload(photoType, 'library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [runUpload],
  );

  const renderRow = (label: string, type: PhotoType, items: BookingPhoto[]) => (
    <View>
      <Text variant="bodySmall" color="midGray">
        {label} ({items.length})
      </Text>
      <Spacer size="xs" />
      <View style={styles.thumbRow}>
        {items.map((p) => (
          <Image
            key={p.id}
            source={{ uri: p.storage_url }}
            style={styles.thumb}
            accessibilityLabel={`${label} photo`}
          />
        ))}
        <Pressable
          onPress={() => promptSource(type)}
          disabled={disabled || uploading !== null}
          accessibilityRole="button"
          accessibilityLabel={`Add ${type} photo`}
          testID={`add-${type}-photo`}
          style={[
            styles.addTile,
            {
              borderColor: palette.midGray,
              opacity: disabled || uploading !== null ? 0.5 : 1,
            },
          ]}
        >
          {uploading === type ? (
            <ActivityIndicator color={palette.electricBlue} />
          ) : (
            <>
              {items.length === 0 ? (
                <Camera size={20} color={palette.midGray} strokeWidth={2} />
              ) : (
                <Plus size={20} color={palette.midGray} strokeWidth={2} />
              )}
            </>
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderRow('Before', 'before', before)}
      <Spacer size="md" />
      {renderRow('After', 'after', after)}
    </View>
  );
}

export default JobPhotoCapture;

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.input,
    backgroundColor: '#00000010',
  },
  addTile: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
