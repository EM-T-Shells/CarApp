// Provider Earnings stack layout — wraps the earnings + kudos screen in a
// headerless Stack so the screen renders its own header.

import React from 'react';
import { Stack } from 'expo-router';

export default function ProviderEarningsLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
