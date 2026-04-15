// Services stack layout — wraps the services tab in a headerless Stack
// so the screen renders its own header content.

import React from 'react';
import { Stack } from 'expo-router';

export default function ServicesLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
