// Avatar — user and provider profile photo component for CarApp.
// Renders a Supabase Storage image URI when available, falls back to initials
// on a colored background. Supports xs/sm/md/lg/xl sizes, an optional online
// presence dot, optional press interaction, and full dark-mode support.

import React, { useMemo, useState } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  useColorScheme,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Text } from './Text';
import { colors } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /** Full name of the user — used to derive initials when no image is supplied. */
  name?: string;
  /** Public image URI from Supabase Storage. When absent, initials are shown. */
  uri?: string | null;
  /** Avatar size preset. Defaults to 'md' (44pt — meets WCAG 2.1 AA touch target). */
  size?: AvatarSize;
  /**
   * When `true` renders a green presence dot; `false` renders a gray dot.
   * Omit the prop entirely to hide the dot.
   */
  online?: boolean;
  /** Called when the avatar is tapped. Wraps in a Pressable with a ≥44pt hit target. */
  onPress?: () => void;
  /** Override the outer container style. */
  style?: ViewStyle;
  /** Accessibility label read by screen readers. Defaults to "{name}'s avatar". */
  accessibilityLabel?: string;
}

// ─── Size Config ──────────────────────────────────────────────────────────────

const SIZE_MAP: Record<AvatarSize, { diameter: number; fontSize: number; dotSize: number }> = {
  xs: { diameter: 24, fontSize: 9,  dotSize: 7  },
  sm: { diameter: 32, fontSize: 12, dotSize: 8  },
  md: { diameter: 44, fontSize: 16, dotSize: 10 },
  lg: { diameter: 56, fontSize: 20, dotSize: 12 },
  xl: { diameter: 72, fontSize: 26, dotSize: 14 },
};

// ─── Initials Palette ─────────────────────────────────────────────────────────
// Brand-adjacent backgrounds for the initials fallback — each contrasts with
// white text at WCAG AA level, except Gold (#4) which uses dark text.

const INITIALS_BACKGROUNDS = [
  '#3D3B8E', // Deep Indigo
  '#1A6DFF', // Electric Blue
  '#10A96A', // Emerald Green
  '#6B4EFF', // Violet
  '#C0392B', // Brick Red
  '#16A085', // Teal
  '#8E44AD', // Purple
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive 1–2 uppercase initials from a display name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Pick a stable background color index from the name string (hash-based). */
function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % INITIALS_BACKGROUNDS.length;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Avatar = React.forwardRef<View, AvatarProps>(
  function Avatar(
    {
      name,
      uri,
      size = 'md',
      online,
      onPress,
      style,
      accessibilityLabel,
    },
    ref
  ) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;

    // Track image load failure so we can fall back to initials gracefully.
    const [imgError, setImgError] = useState(false);
    const showImage = !!uri && !imgError;

    const { diameter, fontSize, dotSize } = SIZE_MAP[size];

    // ── Initials ──────────────────────────────────────────────────────────────
    const { initials, bgColor } = useMemo(() => {
      const displayName = name ?? '';
      const initials = displayName ? getInitials(displayName) : '?';
      const colorIndex = getColorIndex(displayName);
      const bgColor = INITIALS_BACKGROUNDS[colorIndex];
      return { initials, bgColor };
    }, [name]);

    // ── Circle container ──────────────────────────────────────────────────────
    const circleStyle = useMemo((): ViewStyle => ({
      width: diameter,
      height: diameter,
      borderRadius: diameter / 2,
      overflow: 'hidden',
      backgroundColor: showImage ? 'transparent' : bgColor,
      justifyContent: 'center',
      alignItems: 'center',
    }), [diameter, showImage, bgColor]);

    // ── Initials text ─────────────────────────────────────────────────────────
    const initialsTextStyle = useMemo((): TextStyle => ({
      fontSize,
      fontFamily: 'Inter',
      fontWeight: '600',
      color: '#FFFFFF',
      letterSpacing: 0.5,
      lineHeight: fontSize * 1.25,
    }), [fontSize]);

    // ── Presence dot ──────────────────────────────────────────────────────────
    const dotStyle = useMemo((): ViewStyle => ({
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: online ? palette.emeraldGreen : (isDark ? 'rgba(160,160,160,0.6)' : 'rgba(119,119,119,0.5)'),
      borderWidth: 1.5,
      borderColor: isDark ? palette.offWhite : '#FFFFFF',
    }), [online, dotSize, isDark, palette]);

    // ── Accessibility ─────────────────────────────────────────────────────────
    const a11yLabel = accessibilityLabel ?? (name ? `${name}'s avatar` : 'Avatar');

    // ── Hit slop for small sizes ──────────────────────────────────────────────
    // Sizes xs and sm are below 44pt — expand the hit area to meet WCAG AA.
    const hitSlop = diameter < 44
      ? {
          top: (44 - diameter) / 2,
          bottom: (44 - diameter) / 2,
          left: (44 - diameter) / 2,
          right: (44 - diameter) / 2,
        }
      : undefined;

    // ── Inner avatar circle ───────────────────────────────────────────────────
    const avatarCircle = (
      <View style={[circleStyle, style]} ref={onPress ? undefined : ref}>
        {showImage ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImgError(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={initialsTextStyle}>{initials}</Text>
        )}
        {online !== undefined && <View style={dotStyle} />}
      </View>
    );

    if (onPress) {
      return (
        <Pressable
          ref={ref as React.Ref<View>}
          onPress={onPress}
          hitSlop={hitSlop}
          accessibilityLabel={a11yLabel}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}
        >
          {avatarCircle}
        </Pressable>
      );
    }

    return avatarCircle;
  }
);

Avatar.displayName = 'Avatar';

export default Avatar;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
});
