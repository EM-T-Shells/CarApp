// VehicleForm — text-input form used during the customer onboarding
// vehicle step. Writes directly to useSignUpDraftStore and surfaces
// inline validation errors via utils/validators.ts. Field names map
// 1:1 to columns in the `vehicles` table.
//
// This is a controlled-by-store component — the parent screen just
// renders <VehicleForm /> and reads back from the store.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from 'react-native';
import tokens from '../../design/tokens';
import { textStyles } from '../../design/typography';
import {
  useSignUpDraftStore,
  type VehicleDraft,
} from '../../state/signUpDraft';
import {
  isValidVehicleYear,
  isValidVehicleMake,
  isValidVehicleModel,
  isValidLicensePlate,
} from '../../utils/validators';

type FieldKey = keyof VehicleDraft;

type FieldErrors = Partial<Record<FieldKey, string | null>>;

export interface VehicleFormProps {
  /** Whether to show the optional trim / color / plate fields. */
  showOptionalFields?: boolean;
}

export function VehicleForm({
  showOptionalFields = true,
}: VehicleFormProps): React.ReactElement {
  const vehicle = useSignUpDraftStore((s) => s.vehicle);
  const setVehicle = useSignUpDraftStore((s) => s.setVehicle);

  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(field: FieldKey, value: string): string | null {
    switch (field) {
      case 'year': {
        const r = isValidVehicleYear(value);
        return r.valid ? null : r.error;
      }
      case 'make': {
        const r = isValidVehicleMake(value);
        return r.valid ? null : r.error;
      }
      case 'model': {
        const r = isValidVehicleModel(value);
        return r.valid ? null : r.error;
      }
      case 'licensePlate': {
        const r = isValidLicensePlate(value);
        return r.valid ? null : r.error;
      }
      default:
        return null;
    }
  }

  function handleBlur(field: FieldKey) {
    return (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      const value = e.nativeEvent.text;
      setErrors((prev) => ({ ...prev, [field]: validate(field, value) }));
    };
  }

  function handleChange(field: FieldKey) {
    return (value: string) => {
      setVehicle({ [field]: value || null });
      // Clear the error as the user types — it'll re-run on blur.
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: null }));
      }
    };
  }

  return (
    <View style={styles.container}>
      <Field
        label="Year"
        required
        value={vehicle.year}
        placeholder="2022"
        keyboardType="number-pad"
        maxLength={4}
        error={errors.year ?? null}
        onChangeText={(v) => setVehicle({ year: v })}
        onBlur={handleBlur('year')}
        accessibilityLabel="Vehicle year"
      />
      <Field
        label="Make"
        required
        value={vehicle.make}
        placeholder="Honda"
        autoCapitalize="words"
        error={errors.make ?? null}
        onChangeText={(v) => setVehicle({ make: v })}
        onBlur={handleBlur('make')}
        accessibilityLabel="Vehicle make"
      />
      <Field
        label="Model"
        required
        value={vehicle.model}
        placeholder="Civic"
        autoCapitalize="words"
        error={errors.model ?? null}
        onChangeText={(v) => setVehicle({ model: v })}
        onBlur={handleBlur('model')}
        accessibilityLabel="Vehicle model"
      />

      {showOptionalFields ? (
        <>
          <Field
            label="Trim (optional)"
            value={vehicle.trim ?? ''}
            placeholder="EX-L"
            autoCapitalize="words"
            onChangeText={handleChange('trim')}
            accessibilityLabel="Vehicle trim"
          />
          <Field
            label="Color (optional)"
            value={vehicle.color ?? ''}
            placeholder="Silver"
            autoCapitalize="words"
            onChangeText={handleChange('color')}
            accessibilityLabel="Vehicle color"
          />
          <Field
            label="License plate (optional)"
            value={vehicle.licensePlate ?? ''}
            placeholder="ABC-1234"
            autoCapitalize="characters"
            maxLength={10}
            error={errors.licensePlate ?? null}
            onChangeText={handleChange('licensePlate')}
            onBlur={handleBlur('licensePlate')}
            accessibilityLabel="License plate"
          />
        </>
      ) : null}
    </View>
  );
}

export default VehicleForm;

// ── Field ───────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  onChangeText: (value: string) => void;
  onBlur?: (e: NativeSyntheticEvent<TextInputFocusEventData>) => void;
  accessibilityLabel?: string;
}

function Field({
  label,
  value,
  placeholder,
  required,
  error,
  keyboardType = 'default',
  autoCapitalize = 'none',
  maxLength,
  onChangeText,
  onBlur,
  accessibilityLabel,
}: FieldProps): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.light.midGray}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onBlur={onBlur}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={error ?? undefined}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing.base,
  },
  field: {
    gap: tokens.spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: tokens.colors.light.charcoal,
  },
  input: {
    ...textStyles.body,
    color: tokens.colors.light.charcoal,
    backgroundColor: tokens.colors.light.offWhite,
    borderRadius: tokens.borderRadius.input,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    paddingHorizontal: tokens.spacing.base,
    paddingVertical: tokens.spacing.md,
    minHeight: 44,
  },
  inputError: {
    borderColor: '#D92B2B',
  },
  errorText: {
    ...textStyles.caption,
    color: '#D92B2B',
  },
});
