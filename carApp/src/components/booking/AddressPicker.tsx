// AddressPicker — text-based address input for the booking flow.
// MVP uses plain text entry (no Google Maps autocomplete due to billing).
// Renders a labeled text field with a map-pin icon and optional error state.

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { TextField } from '../ui/TextField';
import { Text } from '../ui/Text';
import { spacing, colors } from '../../design/tokens';
import { useColorScheme } from 'react-native';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AddressPickerProps {
  /** Current address value. */
  value: string;
  /** Called when the address text changes. */
  onChangeText: (address: string) => void;
  /** Inline error message shown below the input. */
  error?: string;
  /** Optional container style overrides. */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddressPicker({
  value,
  onChangeText,
  error,
  style,
}: AddressPickerProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  return (
    <View style={style}>
      <TextField
        label="Service Address"
        placeholder="Enter the address where service will be performed"
        value={value}
        onChangeText={onChangeText}
        error={error}
        hint="We'll come to you — enter a street address, driveway, or parking lot"
        leftIcon={
          <MapPin size={18} color={palette.midGray} strokeWidth={2} />
        }
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Service address"
      />
    </View>
  );
}

export default AddressPicker;
