// RoleSelector — card-based picker used during customer onboarding
// to choose between "customer", "provider", and "both". Mirrors the
// three allowed values in users.role (see Blueprint/schema_policies.sql).
//
// Pure controlled component. The caller supplies the current value
// and an onChange handler; selection persistence lives in the parent
// (typically useSignUpDraftStore).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import tokens from '../../design/tokens';
import { textStyles } from '../../design/typography';
import type { UserRole } from '../../state/auth';

export interface RoleOption {
  value: UserRole;
  title: string;
  description: string;
}

const OPTIONS: readonly RoleOption[] = [
  {
    value: 'customer',
    title: 'Book services',
    description: 'I want to book detailers and mechanics for my vehicles.',
  },
  {
    value: 'provider',
    title: 'Offer services',
    description: 'I want to sign up as a mobile detailer or mechanic.',
  },
  {
    value: 'both',
    title: 'Both',
    description: 'I want to book services and offer services on CarApp.',
  },
] as const;

export interface RoleSelectorProps {
  value: UserRole | null;
  onChange: (role: UserRole) => void;
}

export function RoleSelector({
  value,
  onChange,
}: RoleSelectorProps): React.ReactElement {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Choose how you plan to use CarApp"
      style={styles.container}
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.title}
            accessibilityHint={option.description}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.radioOuter}>
              {selected ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.textBlock}>
              <Text
                style={[
                  styles.title,
                  selected && styles.titleSelected,
                ]}
              >
                {option.title}
              </Text>
              <Text style={styles.description}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default RoleSelector;

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    padding: tokens.spacing.base,
    borderRadius: tokens.borderRadius.card,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    backgroundColor: tokens.colors.light.offWhite,
    minHeight: 72,
  },
  cardSelected: {
    borderColor: tokens.colors.light.electricBlue,
    borderWidth: 2,
  },
  cardPressed: {
    opacity: 0.8,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: tokens.colors.light.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.light.electricBlue,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...textStyles.subheading,
    color: tokens.colors.light.charcoal,
    marginBottom: tokens.spacing.xs,
  },
  titleSelected: {
    color: tokens.colors.light.deepIndigo,
  },
  description: {
    ...textStyles.bodySmall,
    color: tokens.colors.light.midGray,
  },
});
