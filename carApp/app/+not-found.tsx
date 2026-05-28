// Fallback screen for any URL that doesn't match a registered route.
// Renders a branded spinner while the auth gate in app/_layout.tsx
// redirects the user to (auth) or (tabs) based on their session.

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import tokens from '../src/design/tokens';

export default function NotFound(): React.ReactElement {
  return (
    <View style={styles.container} testID="not-found-fallback">
      <ActivityIndicator
        size="large"
        color={tokens.colors.light.electricBlue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.light.offWhite,
  },
});
