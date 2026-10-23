// VehicleConditionForm (Phase 2) — the vehicle size confirmation and the three
// condition questions.
//
// These four answers are the entire difference between "an interior detail"
// and "a three-hour interior detail". Spec §1: an interior detail ranges from
// one to three hours and nothing in the booking recorded which end it was.
//
// Size is pre-filled from the vehicle's own size_class and confirmable rather
// than asked fresh (spec §3) — the customer already told us what car they
// drive. The three condition questions are asked every time, because condition
// is a property of this visit, not of the car.
//
// Presentational and controlled: the parent owns the answers. That keeps it
// drivable from the booking draft today and from a provider's re-quote screen
// in Phase 3, which needs the same questions with different plumbing.

import React from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import {
  PET_LEVELS,
  PET_LEVEL_LABELS,
  SOIL_LEVELS,
  SOIL_LEVEL_LABELS,
  STAIN_LEVELS,
  STAIN_LEVEL_LABELS,
  VEHICLE_SIZE_CLASSES,
  VEHICLE_SIZE_LABELS,
  type ConditionAnswers,
  type VehicleSizeClass,
} from '../../utils/suggestion';

// ── Option row ────────────────────────────────────────────────────────

interface OptionRowProps<T extends string> {
  question: string;
  hint?: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null | undefined;
  onSelect: (value: T) => void;
  palette: Palette;
  isDark: boolean;
  testIDPrefix: string;
}

function OptionRow<T extends string>({
  question,
  hint,
  options,
  labels,
  value,
  onSelect,
  palette,
  isDark,
  testIDPrefix,
}: OptionRowProps<T>): React.ReactElement {
  const styles = makeStyles(palette, isDark);

  return (
    <View>
      <Text variant="label" color="charcoal">
        {question}
      </Text>
      {hint ? (
        <>
          <Spacer size="xs" />
          <Text variant="caption" color="midGray">
            {hint}
          </Text>
        </>
      ) : null}
      <Spacer size="sm" />
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              testID={`${testIDPrefix}-${option}`}
              onPress={() => onSelect(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={labels[option]}
              style={[
                styles.option,
                selected && {
                  backgroundColor: palette.electricBlue,
                  borderColor: palette.electricBlue,
                },
              ]}
            >
              <Text
                variant="bodySmall"
                color={selected ? 'offWhite' : 'charcoal'}
              >
                {labels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────

export interface VehicleConditionFormProps {
  sizeClass: VehicleSizeClass | null;
  answers: ConditionAnswers;
  onChangeSizeClass: (value: VehicleSizeClass) => void;
  onChangeAnswer: <K extends keyof ConditionAnswers>(
    question: K,
    answer: ConditionAnswers[K],
  ) => void;
  /**
   * True when the size was pre-filled from the vehicle rather than chosen here.
   * Only changes the copy — the control behaves identically either way, because
   * a pre-filled answer the customer cannot correct is worse than no pre-fill.
   */
  sizePrefilled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────

export function VehicleConditionForm({
  sizeClass,
  answers,
  onChangeSizeClass,
  onChangeAnswer,
  sizePrefilled = false,
}: VehicleConditionFormProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  return (
    <View>
      <OptionRow
        question="Vehicle size"
        hint={
          sizePrefilled
            ? 'From your saved vehicle — change it if this is not right.'
            : 'Bigger vehicles take longer, so this affects your estimate.'
        }
        options={VEHICLE_SIZE_CLASSES}
        labels={VEHICLE_SIZE_LABELS}
        value={sizeClass}
        onSelect={onChangeSizeClass}
        palette={palette}
        isDark={isDark}
        testIDPrefix="size-class"
      />

      <Spacer size="lg" />
      <OptionRow
        question="How is the interior?"
        options={SOIL_LEVELS}
        labels={SOIL_LEVEL_LABELS}
        value={answers.soil_level}
        onSelect={(value) => onChangeAnswer('soil_level', value)}
        palette={palette}
        isDark={isDark}
        testIDPrefix="soil-level"
      />

      <Spacer size="lg" />
      <OptionRow
        question="Do kids or pets ride in it?"
        options={PET_LEVELS}
        labels={PET_LEVEL_LABELS}
        value={answers.pets}
        onSelect={(value) => onChangeAnswer('pets', value)}
        palette={palette}
        isDark={isDark}
        testIDPrefix="pets"
      />

      <Spacer size="lg" />
      <OptionRow
        question="Any stains, smoke or pet hair?"
        hint="Be honest — an accurate answer means an accurate arrival time."
        options={STAIN_LEVELS}
        labels={STAIN_LEVEL_LABELS}
        value={answers.stains}
        onSelect={(value) => onChangeAnswer('stains', value)}
        palette={palette}
        isDark={isDark}
        testIDPrefix="stains"
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    optionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    option: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.button,
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(160,160,160,0.24)'
        : 'rgba(119,119,119,0.24)',
      minHeight: 44,
      justifyContent: 'center',
    },
  });
}

export default VehicleConditionForm;
