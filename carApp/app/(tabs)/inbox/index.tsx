// Inbox tab — empty shell. Will be fleshed out in Phase 11.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Text } from '../../../src/components/ui/Text';
import { colors, spacing } from '../../../src/design/tokens';

export default function InboxScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      <Text variant="heading" color="charcoal">
        Inbox
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
  },
});
