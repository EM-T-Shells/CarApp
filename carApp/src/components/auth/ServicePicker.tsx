// ServicePicker — multi-select list of service catalog entries used
// during the provider onboarding "services" step. Rows come from
// service_catalog via the caller; the component writes the selected
// set directly into useProviderDraftStore.
//
// This is a dumb list — the caller fetches the catalog rows (via
// queries.ts) and passes them in. That keeps the component free of
// any Supabase import and trivial to swap data source on in tests.

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  type ListRenderItem,
} from 'react-native';
import tokens from '../../design/tokens';
import { textStyles } from '../../design/typography';
import {
  useProviderDraftStore,
  type ServicePackageDraft,
} from '../../state/providerDraft';
import type { ServiceCatalog } from '../../types/models';
import { centsToDisplay } from '../../utils/money';

export interface ServicePickerProps {
  /** Rows pulled from service_catalog, filtered to the provider type. */
  catalog: ServiceCatalog[];
  /**
   * Suggested base prices keyed by catalog id, in cents. Displayed as
   * a hint alongside each row. Optional — omit to hide prices.
   */
  suggestedPrices?: Record<string, number>;
  /**
   * Suggested duration in minutes keyed by catalog id. Optional.
   */
  suggestedDurations?: Record<string, number>;
}

export function ServicePicker({
  catalog,
  suggestedPrices,
  suggestedDurations,
}: ServicePickerProps): React.ReactElement {
  const services = useProviderDraftStore((s) => s.services);
  const addService = useProviderDraftStore((s) => s.addService);
  const removeService = useProviderDraftStore((s) => s.removeService);

  const selectedIds = new Set(
    services
      .map((s) => s.catalogId)
      .filter((id): id is string => id !== null),
  );

  const toggle = useCallback(
    (item: ServiceCatalog) => {
      if (selectedIds.has(item.id)) {
        removeService(item.id, item.name);
        return;
      }

      const draft: ServicePackageDraft = {
        catalogId: item.id,
        name: item.name,
        category: item.category,
        basePrice: suggestedPrices?.[item.id] ?? 0,
        durationMins: suggestedDurations?.[item.id] ?? 0,
        description: null,
        isCustom: false,
      };
      addService(draft);
    },
    [selectedIds, addService, removeService, suggestedPrices, suggestedDurations],
  );

  const renderItem: ListRenderItem<ServiceCatalog> = ({ item }) => {
    const selected = selectedIds.has(item.id);
    const priceCents = suggestedPrices?.[item.id];
    const duration = suggestedDurations?.[item.id];

    return (
      <Pressable
        onPress={() => toggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={item.name}
        style={({ pressed }) => [
          styles.row,
          selected && styles.rowSelected,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={styles.rowText}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.category}
            {priceCents !== undefined ? ` • ${centsToDisplay(priceCents)}` : ''}
            {duration !== undefined ? ` • ${duration} min` : ''}
          </Text>
        </View>
        <View style={[styles.check, selected && styles.checkSelected]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      </Pressable>
    );
  };

  if (catalog.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No services available for this provider type.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={catalog}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.listContent}
      accessibilityLabel="Pick the services you offer"
    />
  );
}

function Separator(): React.ReactElement {
  return <View style={styles.separator} />;
}

export default ServicePicker;

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: tokens.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.base,
    borderRadius: tokens.borderRadius.card,
    backgroundColor: tokens.colors.light.offWhite,
    borderWidth: 1,
    borderColor: tokens.colors.light.midGray,
    minHeight: 64,
  },
  rowSelected: {
    borderColor: tokens.colors.light.electricBlue,
    borderWidth: 2,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  name: {
    ...textStyles.subheading,
    color: tokens.colors.light.charcoal,
  },
  meta: {
    ...textStyles.bodySmall,
    color: tokens.colors.light.midGray,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: tokens.colors.light.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: tokens.colors.light.electricBlue,
  },
  checkMark: {
    ...textStyles.label,
    color: tokens.colors.light.offWhite,
  },
  separator: {
    height: tokens.spacing.sm,
  },
  empty: {
    padding: tokens.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: tokens.colors.light.midGray,
  },
});
