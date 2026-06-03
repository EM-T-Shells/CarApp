// BookingPhotoGallery — renders the before/after photos uploaded by the
// provider for a completed booking. Groups photos by `photo_type` and
// shows them in two horizontally scrolling rows. Tapping a thumbnail
// opens it full-screen in a modal so the customer can see the work
// clearly before approving.

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Modal,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { X, Camera } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import type { BookingPhoto } from '../../types/models';

// ─── Types ─────────────────────────────────────────────────────────────

export interface BookingPhotoGalleryProps {
  photos: BookingPhoto[];
}

// ─── Component ─────────────────────────────────────────────────────────

export function BookingPhotoGallery({
  photos,
}: BookingPhotoGalleryProps): React.ReactElement | null {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const { width: screenWidth } = useWindowDimensions();

  const [openUri, setOpenUri] = useState<string | null>(null);

  if (photos.length === 0) {
    return null;
  }

  const before = photos.filter((p) => p.photo_type === 'before');
  const after = photos.filter((p) => p.photo_type === 'after');

  return (
    <>
      <Card variant="outlined">
        <View style={styles.headerRow}>
          <Camera size={16} color={palette.midGray} strokeWidth={2} />
          <Text variant="label" color="charcoal">
            Photos
          </Text>
        </View>

        <Spacer size="md" />

        {before.length > 0 && (
          <>
            <Text variant="caption" color="midGray" style={styles.sectionLabel}>
              Before
            </Text>
            <PhotoRow
              photos={before}
              onOpen={setOpenUri}
              palette={palette}
            />
          </>
        )}

        {before.length > 0 && after.length > 0 && <Spacer size="md" />}

        {after.length > 0 && (
          <>
            <Text variant="caption" color="midGray" style={styles.sectionLabel}>
              After
            </Text>
            <PhotoRow
              photos={after}
              onOpen={setOpenUri}
              palette={palette}
            />
          </>
        )}
      </Card>

      {/* Full-screen lightbox modal */}
      <Modal
        visible={openUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenUri(null)}
      >
        <View style={styles.modalRoot}>
          {openUri && (
            <Image
              source={{ uri: openUri }}
              style={{ width: screenWidth, height: '100%' }}
              resizeMode="contain"
              accessibilityLabel="Booking photo, full size"
            />
          )}
          <Pressable
            onPress={() => setOpenUri(null)}
            style={styles.modalClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
          >
            <X size={24} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

export default BookingPhotoGallery;

// ─── Internal: thumbnail row ───────────────────────────────────────────

interface PhotoRowProps {
  photos: BookingPhoto[];
  onOpen: (uri: string) => void;
  palette: (typeof colors)[keyof typeof colors];
}

function PhotoRow({
  photos,
  onOpen,
  palette,
}: PhotoRowProps): React.ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
    >
      {photos.map((photo) => (
        <Pressable
          key={photo.id}
          onPress={() => onOpen(photo.storage_url)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Open ${photo.photo_type} photo`}
          style={({ pressed }) => [
            styles.thumb,
            { borderColor: palette.midGray + '33' },
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={{ uri: photo.storage_url }}
            style={styles.thumbImg}
            resizeMode="cover"
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const THUMB_SIZE = 110;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  rowContent: {
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: borderRadius.input,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 56,
    right: spacing.base,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
