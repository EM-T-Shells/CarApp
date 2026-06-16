// OnboardingHeader — the dark indigo top bar shared by every screen in
// the account-creation flow (sign-up → vehicle → role → provider →
// pending). It owns the top safe-area inset, shows the centered brand
// wordmark, an optional back chevron, and an optional row of progress
// dots beneath the bar — matching the FigJam account-creation design.
//
// Screens that use this should NOT also apply a top SafeAreaView edge,
// or the status-bar inset is padded twice.

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import tokens from '../../design/tokens';
import { textStyles } from '../../design/typography';

export interface OnboardingHeaderProps {
  /** When provided, renders a back chevron on the left of the bar. */
  onBack?: () => void;
  /** Zero-based index of the current step. Omit to hide progress dots. */
  currentStep?: number;
  /** Total number of steps in the flow. Omit to hide progress dots. */
  totalSteps?: number;
  /** Wordmark shown centered in the bar. */
  brand?: string;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function OnboardingHeader({
  onBack,
  currentStep,
  totalSteps,
  brand = 'CarApp',
}: OnboardingHeaderProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const showProgress =
    typeof currentStep === 'number' &&
    typeof totalSteps === 'number' &&
    totalSteps > 0;

  // Announce step changes for VoiceOver/TalkBack.
  const stepLabel = showProgress
    ? `Step ${Math.min((currentStep ?? 0) + 1, totalSteps ?? 1)} of ${totalSteps}`
    : '';
  React.useEffect(() => {
    if (stepLabel) AccessibilityInfo.announceForAccessibility(stepLabel);
  }, [stepLabel]);

  return (
    <View>
      <View style={[styles.bar, { paddingTop: insets.top + tokens.spacing.sm }]}>
        <View style={styles.barRow}>
          <View style={styles.side}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={HIT_SLOP}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                testID="onboarding-header-back"
              >
                <ChevronLeft
                  size={26}
                  color={tokens.colors.light.offWhite}
                />
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.brand} accessibilityRole="header">
            {brand}
          </Text>

          {/* Right spacer keeps the wordmark optically centered. */}
          <View style={styles.side} />
        </View>
      </View>

      {showProgress ? (
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={stepLabel}
          accessibilityValue={{
            min: 1,
            max: totalSteps,
            now: Math.min((currentStep ?? 0) + 1, totalSteps ?? 1),
          }}
        >
          {Array.from({ length: totalSteps ?? 0 }).map((_, i) => {
            const isActive = i === currentStep;
            const isComplete = i < (currentStep ?? 0);
            return (
              <View
                key={`dot-${i}`}
                style={[
                  styles.dot,
                  isComplete && styles.dotComplete,
                  isActive && styles.dotActive,
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default OnboardingHeader;

// ── Styles ──────────────────────────────────────────────────────────────

const BAR_HEIGHT = 44;
const DOT_SIZE = 8;

const styles = StyleSheet.create({
  bar: {
    backgroundColor: tokens.colors.light.deepIndigo,
    paddingBottom: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.base,
  },
  barRow: {
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  brand: {
    ...textStyles.subheading,
    color: tokens.colors.light.offWhite,
    letterSpacing: 0.5,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.base,
    paddingBottom: tokens.spacing.xs,
    minHeight: 44,
    backgroundColor: tokens.colors.light.offWhite,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: tokens.colors.light.midGray,
    opacity: 0.4,
  },
  dotComplete: {
    backgroundColor: tokens.colors.light.deepIndigo,
    opacity: 1,
  },
  dotActive: {
    width: DOT_SIZE * 3,
    backgroundColor: tokens.colors.light.electricBlue,
    opacity: 1,
  },
});
