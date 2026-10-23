// Provider Inbox stack layout — wraps the provider's thread list in a
// headerless Stack so the screen renders its own header. Thread detail is
// reused from the customer group via an absolute route, so no detail screen
// lives here.

import React from 'react';
import { Stack } from 'expo-router';

export default function ProviderInboxLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
