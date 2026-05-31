// VettingStepIndicator (Flow 4.x) — a compact, horizontally scrollable tracker
// for the provider vetting flow. Renders a numbered circle per step with a
// status-driven treatment (approved = green check, submitted = gold, rejected
// = red, pending = gray) and an optional active highlight. Shared by the
// vetting hub and the individual step screens.

import React from 'react';
import { ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing } from '../../design/tokens';

export type VettingStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface VettingStepItem {
  key: string;
  label: string;
  status: VettingStatus;
}

export interface VettingStepIndicatorProps {
  steps: VettingStepItem[];
  /** Highlights the step the user is currently on. */
  activeKey?: string;
}

const REJECTED_RED = '#D92B2B';

function circleColor(
  status: VettingStatus,
  active: boolean,
  palette: (typeof colors)['light'] | (typeof colors)['dark'],
): string {
  if (status === 'approved') return palette.emeraldGreen;
  if (status === 'rejected') return REJECTED_RED;
  if (status === 'submitted') return palette.gearGold;
  return active ? palette.deepIndigo : palette.midGray;
}

export function VettingStepIndicator({
  steps,
  activeKey,
}: VettingStepIndicatorProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="progressbar"
    >
      {steps.map((step, index) => {
        const active = step.key === activeKey;
        const color = circleColor(step.status, active, palette);
        const approved = step.status === 'approved';
        return (
          <View key={step.key} style={styles.stepWrap}>
            <View style={styles.circleRow}>
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: approved ? color : 'transparent',
                    borderColor: color,
                  },
                ]}
              >
                {approved ? (
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <Text variant="caption" style={{ color, fontWeight: '700' }}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        step.status === 'approved'
                          ? palette.emeraldGreen
                          : palette.midGray,
                    },
                  ]}
                />
              ) : null}
            </View>
            <Text
              variant="caption"
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? palette.charcoal : palette.midGray },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default VettingStepIndicator;

const CIRCLE = 28;

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  stepWrap: {
    width: 84,
    alignItems: 'center',
  },
  circleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    position: 'absolute',
    right: -28,
    width: 28,
    height: 2,
  },
  label: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
