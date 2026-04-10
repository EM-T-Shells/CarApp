// StepIndicator — horizontal progress bar used by the multi-step
// onboarding flows (customer signup, provider vetting). Renders a
// dot per step, filled up to and including the current index.

import React from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import tokens from '../../design/tokens';

export interface StepIndicatorProps {
  /** Total number of steps in the flow. Must be >= 1. */
  totalSteps: number;
  /** Zero-based index of the current step. */
  currentStep: number;
  /** Optional label for assistive tech. */
  accessibilityLabel?: string;
}

const DOT_SIZE = 10;
const ACTIVE_DOT_SIZE = 14;
const SEGMENT_HEIGHT = 3;

export function StepIndicator({
  totalSteps,
  currentStep,
  accessibilityLabel,
}: StepIndicatorProps): React.ReactElement | null {
  if (totalSteps < 1) return null;

  const label =
    accessibilityLabel ??
    `Step ${Math.min(currentStep + 1, totalSteps)} of ${totalSteps}`;

  // Announce step changes for VoiceOver/TalkBack when the prop changes.
  React.useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);

  const items: React.ReactElement[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const isActive = i === currentStep;
    const isComplete = i < currentStep;

    items.push(
      <View
        key={`dot-${i}`}
        style={[
          styles.dot,
          isActive && styles.dotActive,
          isComplete && styles.dotComplete,
        ]}
      />,
    );

    if (i < totalSteps - 1) {
      items.push(
        <View
          key={`segment-${i}`}
          style={[
            styles.segment,
            i < currentStep && styles.segmentComplete,
          ]}
        />,
      );
    }
  }

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 1,
        max: totalSteps,
        now: Math.min(currentStep + 1, totalSteps),
      }}
      style={styles.container}
    >
      {items}
    </View>
  );
}

export default StepIndicator;

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.base,
    minHeight: 44,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: tokens.colors.light.midGray,
  },
  dotActive: {
    width: ACTIVE_DOT_SIZE,
    height: ACTIVE_DOT_SIZE,
    borderRadius: ACTIVE_DOT_SIZE / 2,
    backgroundColor: tokens.colors.light.electricBlue,
  },
  dotComplete: {
    backgroundColor: tokens.colors.light.deepIndigo,
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    marginHorizontal: tokens.spacing.xs,
    backgroundColor: tokens.colors.light.midGray,
    borderRadius: SEGMENT_HEIGHT / 2,
  },
  segmentComplete: {
    backgroundColor: tokens.colors.light.deepIndigo,
  },
});
