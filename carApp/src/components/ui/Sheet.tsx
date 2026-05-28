// Sheet — bottom drawer modal for CarApp.
// Used for confirmations, filter panels, action sheets, and alerts.
// Animates in/out with a spring via Reanimated. Backdrop tap and swipe-down
// both dismiss. Keyboard-avoidance is built in for sheets with form inputs.
// Dark mode is fully supported via dynamic color tokens.

import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { Text } from './Text';
import { borderRadius, colors, spacing } from '../../design/tokens';

// ─── Animation constants ──────────────────────────────────────────────────────

/** Pixel offset used as the "off-screen" starting position for the sheet. */
const OFFSCREEN_Y = 600;

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.8,
} as const;

/** Downward drag distance (px) that triggers auto-dismiss on release. */
const DISMISS_THRESHOLD = 80;

/** Vertical velocity (px/s) that triggers auto-dismiss on release. */
const DISMISS_VELOCITY = 800;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SheetProps {
  /** Controls whether the sheet is shown. */
  visible: boolean;
  /**
   * Called when the sheet requests to close — backdrop tap, swipe-down, or
   * the X button. The parent must update its state to set visible=false.
   */
  onClose: () => void;
  /**
   * Optional title shown in the sheet header row.
   * When omitted no header is rendered (only the drag handle appears).
   */
  title?: string;
  /** Content rendered inside the sheet body. */
  children: React.ReactNode;
  /**
   * Style override for the sheet panel container.
   * Use this to set a fixed height or max-height when needed.
   */
  style?: ViewStyle;
  /** Style override for the inner content padding wrapper. */
  contentStyle?: ViewStyle;
  /** Screen-reader label for the sheet. Defaults to the title or 'Sheet'. */
  accessibilityLabel?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Sheet = React.memo<SheetProps>(function Sheet({
  visible,
  onClose,
  title,
  children,
  style,
  contentStyle,
  accessibilityLabel,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  // isRendered mirrors visible but stays true during the exit animation so the
  // Modal doesn't unmount before the spring finishes.
  const [isRendered, setIsRendered] = useState(false);

  const translateY = useSharedValue(OFFSCREEN_Y);
  const backdropOpacity = useSharedValue(0);

  // When visible becomes true, mount the Modal immediately.
  useEffect(() => {
    if (visible) {
      setIsRendered(true);
    }
  }, [visible]);

  // Once mounted and visible, drive the entrance animation.
  useEffect(() => {
    if (isRendered && visible) {
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
      translateY.value = withSpring(0, SPRING_CONFIG);
    }
  }, [isRendered, visible]);

  // When visible becomes false, animate out then unmount.
  useEffect(() => {
    if (!visible && isRendered) {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(OFFSCREEN_Y, SPRING_CONFIG, () => {
        runOnJS(setIsRendered)(false);
      });
    }
  }, [visible]);

  // ── Dismiss helpers ──

  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // Animate out then call onClose — used by the backdrop tap and close button.
  const animateOutAndDismiss = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withSpring(OFFSCREEN_Y, SPRING_CONFIG, () => {
      runOnJS(dismiss)();
    });
  }, [dismiss]);

  // ── Swipe-to-dismiss gesture ──
  // activeOffsetY(10) + failOffsetY(-5): the gesture only activates on a clear
  // downward drag so it won't conflict with ScrollViews inside the sheet.

  const dragStartY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetY(-5)
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      // Clamp to 0 — upward drags past the rest position are ignored.
      translateY.value = Math.max(0, dragStartY.value + e.translationY);
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        backdropOpacity.value = withTiming(0, { duration: 180 });
        translateY.value = withSpring(OFFSCREEN_Y, SPRING_CONFIG, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // ── Animated styles ──

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Colours ──

  const sheetBg = isDark ? '#1E1E2E' : '#FFFFFF';
  const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  const dividerColor = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.06)';

  const a11yLabel = accessibilityLabel ?? title ?? 'Sheet';

  if (!isRendered) return null;

  return (
    <Modal
      transparent
      visible={isRendered}
      animationType="none"
      onRequestClose={animateOutAndDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Backdrop ── */}
        <Animated.View
          style={[styles.backdrop, backdropAnimatedStyle]}
          pointerEvents="box-none"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={animateOutAndDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>

        {/* ── Sheet panel ── */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: sheetBg },
              sheetAnimatedStyle,
              style,
            ]}
            accessibilityLabel={a11yLabel}
            accessibilityViewIsModal
          >
            {/* Drag handle */}
            <View style={styles.handleRow} accessible={false}>
              <View
                style={[styles.handle, { backgroundColor: handleColor }]}
              />
            </View>

            {/* Optional header: title + close button */}
            {title != null && (
              <View
                style={[
                  styles.header,
                  { borderBottomColor: dividerColor },
                ]}
              >
                <Text
                  variant="subheading"
                  color="charcoal"
                  numberOfLines={1}
                  style={styles.headerTitle}
                >
                  {title}
                </Text>

                <Pressable
                  onPress={animateOutAndDismiss}
                  style={({ pressed }) => [
                    styles.closeButton,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={8}
                >
                  <X size={20} color={palette.midGray} strokeWidth={2} />
                </Pressable>
              </View>
            )}

            {/* Body content */}
            <View style={[styles.content, contentStyle]}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </Modal>
  );
});

Sheet.displayName = 'Sheet';

export default Sheet;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.card,
    borderTopRightRadius: borderRadius.card,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  // Minimum 44×44pt touch target per WCAG 2.1 AA.
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.6,
  },
});
