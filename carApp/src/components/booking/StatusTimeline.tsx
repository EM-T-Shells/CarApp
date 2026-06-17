// StatusTimeline — horizontal progress indicator for a booking's lifecycle.
// Renders the 5 active statuses (pending → confirmed → en_route → in_progress
// → completed) as connected dots with labels below. Filled nodes mark the
// current and prior steps; remaining steps render in mid-gray.
// Cancelled bookings render as a single danger pill instead of the timeline.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, spacing } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'en_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface StatusTimelineProps {
  status: BookingStatus;
}

const STEPS: { key: BookingStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'en_route', label: 'En Route' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function StatusTimeline({
  status,
}: StatusTimelineProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  // Cancelled — rendered as a danger pill, not a progress bar.
  if (status === 'cancelled') {
    const dangerRed = isDark ? '#FF6B6B' : '#E74C3C';
    return (
      <View
        style={[
          styles.cancelledPill,
          { backgroundColor: dangerRed + '22', borderColor: dangerRed },
        ]}
        accessibilityRole="text"
        accessibilityLabel="Booking cancelled"
      >
        <X size={16} color={dangerRed} strokeWidth={2.5} />
        <Text variant="label" style={{ color: dangerRed }}>
          Cancelled
        </Text>
      </View>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === status);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const inactiveColor = palette.midGray;

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Booking status: ${STEPS[safeIndex].label}`}
      accessibilityValue={{
        min: 0,
        max: STEPS.length - 1,
        now: safeIndex,
      }}
    >
      <View style={styles.row}>
        {STEPS.map((step, i) => {
          const isCompleted = i < safeIndex;
          const isCurrent = i === safeIndex;
          const isDone = isCompleted || isCurrent;

          const nodeColor = isCurrent
            ? palette.electricBlue
            : isCompleted
              ? palette.emeraldGreen
              : 'transparent';

          const borderColor = isDone
            ? isCurrent
              ? palette.electricBlue
              : palette.emeraldGreen
            : inactiveColor;

          const labelColor = isDone ? 'charcoal' : 'midGray';

          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepCol}>
                <View
                  style={[
                    styles.node,
                    {
                      backgroundColor: nodeColor,
                      borderColor,
                    },
                  ]}
                >
                  {isCompleted && (
                    <Check
                      size={12}
                      color={palette.offWhite}
                      strokeWidth={3}
                    />
                  )}
                  {isCurrent && (
                    <View
                      style={[
                        styles.currentDot,
                        { backgroundColor: palette.offWhite },
                      ]}
                    />
                  )}
                </View>
                <Text
                  variant="caption"
                  color={labelColor}
                  style={styles.label}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </View>

              {i < STEPS.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        i < safeIndex ? palette.emeraldGreen : inactiveColor,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default StatusTimeline;

// ─── Styles ──────────────────────────────────────────────────────────────────

const NODE_SIZE = 22;

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCol: {
    alignItems: 'center',
    width: 60,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  // Connector sits between two nodes; vertically centered on the node row.
  connector: {
    flex: 1,
    height: 2,
    marginTop: NODE_SIZE / 2 - 1,
    marginHorizontal: -spacing.xs,
  },
  cancelledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1.5,
  },
});
