// Service catalog — browse screen for all CarApp services. Fetches the
// admin-managed service_catalog table, groups entries by category, and
// renders them in a SectionList. Handles loading, empty, and error states.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  SectionList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, Wrench, Plus } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing } from '../../../src/design/tokens';
import { getServiceCatalog } from '../../../src/lib/supabase/queries';
import type { ServiceCatalog } from '../../../src/types/models';

// ── Types ────────────────────────────────────────────────────────────

interface CatalogSection {
  title: string;
  category: string;
  data: ServiceCatalog[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  detailing: 'Detailing',
  mechanical: 'Mechanical',
  addon: 'Add-ons',
};

function formatCategoryTitle(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  );
}

function groupByCategory(items: ServiceCatalog[]): CatalogSection[] {
  const groups: Record<string, ServiceCatalog[]> = {};
  const order: string[] = [];

  for (const item of items) {
    const cat = item.category;
    if (!groups[cat]) {
      groups[cat] = [];
      order.push(cat);
    }
    groups[cat].push(item);
  }

  return order.map((cat) => ({
    title: formatCategoryTitle(cat),
    category: cat,
    data: groups[cat],
  }));
}

// ── Screen ───────────────────────────────────────────────────────────

export default function ServicesScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await getServiceCatalog();

    if (result.error) {
      setError(result.error);
    } else {
      setSections(groupByCategory(result.data));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const getCategoryIcon = useCallback(
    (category: string) => {
      switch (category) {
        case 'detailing':
          return (
            <Sparkles
              size={18}
              color={palette.electricBlue}
              strokeWidth={2}
            />
          );
        case 'mechanical':
          return (
            <Wrench size={18} color={palette.emeraldGreen} strokeWidth={2} />
          );
        default:
          return <Plus size={18} color={palette.midGray} strokeWidth={2} />;
      }
    },
    [palette],
  );

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <ActivityIndicator size="large" color={palette.electricBlue} />
        <Spacer size="md" />
        <Text variant="body" color="midGray">
          Loading services...
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
        <Text variant="subheading" color="charcoal">
          Something went wrong
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray">
          {error.message}
        </Text>
        <Spacer size="lg" />
        <Button
          label="Retry"
          variant="primary"
          size="md"
          onPress={loadCatalog}
        />
      </SafeAreaView>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────
  if (sections.length === 0) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        <Text variant="subheading" color="charcoal">
          No services available
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray">
          Check back soon for new services
        </Text>
      </SafeAreaView>
    );
  }

  // ── Catalog list ───────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text variant="heading" color="charcoal">
          Services
        </Text>
        <Spacer size="xs" />
        <Text variant="body" color="midGray">
          Browse our service catalog
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {getCategoryIcon(section.category)}
            <Text variant="subheading" color="charcoal">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Card variant="outlined" style={styles.serviceItem}>
            <Text variant="body" color="charcoal">
              {item.name}
            </Text>
          </Card>
        )}
        SectionSeparatorComponent={() => <Spacer size="sm" />}
        ItemSeparatorComponent={() => <Spacer size="sm" />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
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
  header: {
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  serviceItem: {
    // Card component provides its own content padding.
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },
});
