// Service providers — lists approved providers who offer a single catalog
// service (reached by tapping a service in the catalog). Fetches providers
// with an active, approved package for this catalog id and renders them with
// the shared ProviderCard. Tapping a provider opens their profile. Handles
// loading, empty, and error states per project conventions.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Spacer } from '../../../src/components/ui/Spacer';
import { ProviderCard } from '../../../src/components/search/ProviderCard';
import { colors, spacing } from '../../../src/design/tokens';
import { getProvidersByService } from '../../../src/lib/supabase/queries';
import type { ProviderSearchResult } from '../../../src/lib/supabase/queries';
import type { ServiceProvidersParams } from '../../../src/types/navigation';

export default function ServiceProvidersScreen(): React.ReactElement {
  const { catalogId, name } = useLocalSearchParams<ServiceProvidersParams>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const [providers, setProviders] = useState<ProviderSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await getProvidersByService(catalogId);

    if (result.error) {
      setError(result.error);
    } else {
      setProviders(result.data);
    }
    setIsLoading(false);
  }, [catalogId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleProviderPress = useCallback(
    (provider: ProviderSearchResult) => {
      router.push(`/search/provider/${provider.id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProviderSearchResult }) => (
      <ProviderCard
        provider={item}
        onPress={() => handleProviderPress(item)}
      />
    ),
    [handleProviderPress],
  );

  const keyExtractor = useCallback(
    (item: ProviderSearchResult) => item.id,
    [],
  );

  const headerTitle = name ?? 'Providers';

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <Stack.Screen options={{ title: headerTitle }} />
        <ActivityIndicator size="large" color={palette.electricBlue} />
        <Spacer size="md" />
        <Text variant="body" color="midGray">
          Finding providers...
        </Text>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <Stack.Screen options={{ title: headerTitle }} />
        <Text variant="subheading" color="charcoal">
          Something went wrong
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray">
          {error.message}
        </Text>
        <Spacer size="lg" />
        <Button label="Retry" variant="primary" size="md" onPress={load} />
      </SafeAreaView>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────
  if (providers.length === 0) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <Stack.Screen options={{ title: headerTitle }} />
        <Text variant="subheading" color="charcoal">
          No providers yet
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray" style={styles.emptyText}>
          No one offers {name ?? 'this service'} in your area just yet. Check
          back soon.
        </Text>
      </SafeAreaView>
    );
  }

  // ── Provider list ──────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <Stack.Screen options={{ title: headerTitle }} />
      <View style={styles.header}>
        <Text variant="body" color="midGray">
          {providers.length}{' '}
          {providers.length === 1 ? 'provider offers' : 'providers offer'} this
          service
        </Text>
      </View>
      <FlatList
        data={providers}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="md" />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  emptyText: {
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
