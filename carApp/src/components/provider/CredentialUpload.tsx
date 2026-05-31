// CredentialUpload (Flows 4.2 / 4.4 / 4.5) — a reusable document-upload control
// for the provider vetting flow. Picks an image (photo of an ID, insurance
// card, or credential) and uploads it to the private vetting-documents bucket
// via storage.uploadVettingDocument, reporting the stored path back to the host
// step so it can advance the relevant provider_vetting status.
//
// NOTE: storage only accepts image mime types (jpeg/png/webp), so documents are
// uploaded as photos. Requires the expo-image-picker native module (dev client).

import React, { useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Check, Upload } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, borderRadius, spacing } from '../../design/tokens';
import { uploadVettingDocument } from '../../lib/supabase/storage';

export interface CredentialUploadProps {
  /** User id — vetting docs are pathed under the user, not the provider. */
  userId: string;
  /** Storage label/prefix for the file (e.g. 'insurance', 'credential', 'identity'). */
  docLabel: string;
  /** Button text. */
  label: string;
  /** Called with the stored path after a successful upload. */
  onUploaded: (path: string) => void;
  disabled?: boolean;
}

export function CredentialUpload({
  userId,
  docLabel,
  label,
  onUploaded,
  disabled = false,
}: CredentialUploadProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const handlePick = useCallback(async (): Promise<void> => {
    if (disabled || uploading) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to upload your document.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const fileSize = blob.size || asset.fileSize || 0;

      const result = await uploadVettingDocument(userId, docLabel, blob, mimeType, fileSize);
      if (result.error || !result.data) {
        Alert.alert('Upload failed', result.error?.message ?? 'Please try again.');
        return;
      }
      setUploadedCount((c) => c + 1);
      onUploaded(result.data);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setUploading(false);
    }
  }, [disabled, uploading, userId, docLabel, onUploaded]);

  const uploaded = uploadedCount > 0;

  return (
    <Pressable
      onPress={handlePick}
      disabled={disabled || uploading}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`upload-${docLabel}`}
      style={[
        styles.button,
        {
          borderColor: uploaded ? palette.emeraldGreen : palette.electricBlue,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {uploading ? (
        <ActivityIndicator color={palette.electricBlue} />
      ) : (
        <View style={styles.row}>
          {uploaded ? (
            <Check size={18} color={palette.emeraldGreen} strokeWidth={2.5} />
          ) : (
            <Upload size={18} color={palette.electricBlue} strokeWidth={2} />
          )}
          <Spacer size="sm" horizontal />
          <Text
            variant="label"
            style={{ color: uploaded ? palette.emeraldGreen : palette.electricBlue }}
          >
            {uploaded ? `Uploaded${uploadedCount > 1 ? ` (${uploadedCount})` : ''} — add another?` : label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default CredentialUpload;

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: borderRadius.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
});
