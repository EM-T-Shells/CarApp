// LugBubble (Flow 3.6) — the persistent floating Lug button. Mounted once in
// (tabs)/_layout.tsx so it overlays every tab screen (per CLAUDE.md "visible on
// every screen"). Tapping opens the full-screen Lug view.
//
// Positioned just above the bottom tab bar. Honors reduced-motion by skipping
// the subtle entrance/idle treatment (none here yet — static button).

import React from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Bot } from 'lucide-react-native';
import { colors, spacing } from '../../design/tokens';

const TAB_BAR_HEIGHT = 60;

export interface LugBubbleProps {
  /** Override the default navigation (used for testing or alternate hosts). */
  onPress?: () => void;
}

export function LugBubble({ onPress }: LugBubbleProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const router = useRouter();

  const handlePress = onPress ?? (() => router.push('/(tabs)/more/lug'));

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Ask Lug"
      accessibilityHint="Opens the Lug assistant"
      testID="lug-bubble"
      style={({ pressed }) => [
        styles.bubble,
        { backgroundColor: palette.gearGold },
        pressed && styles.pressed,
      ]}
    >
      <Bot size={26} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );
}

export default LugBubble;

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: spacing.base,
    bottom: TAB_BAR_HEIGHT + spacing.base,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation / shadow so it floats above screen content.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
