// SearchOverlay — top-anchored search panel shown over the results list.
// Opened after the customer picks "Current location" (or taps the collapsed
// search pill on the results screen). Lets them refine Where (location) and
// When (service date) before running the search. The dimmed backdrop shows
// the provider list underneath; tapping it or the back arrow dismisses the
// overlay without changing the current results. Fully dark-mode aware.

import React, { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Spacer } from '../ui/Spacer';
import { LocationSearchBar } from './LocationSearchBar';
import { colors, borderRadius, spacing } from '../../design/tokens';
import { formatDate } from '../../utils/date';

// ── Props ────────────────────────────────────────────────────────────────────

export interface SearchOverlayProps {
  /** Controls whether the overlay is shown. */
  visible: boolean;
  /** Called when the overlay is dismissed (backdrop tap or back arrow). */
  onClose: () => void;
  /** Called when the customer taps Search. Parent runs the actual fetch. */
  onSubmit: () => void;
  /** Currently selected service date, or null when none is chosen. */
  serviceDate: Date | null;
  /** Called when the customer picks a service date in the When field. */
  onChangeDate: (date: Date) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SearchOverlay({
  visible,
  onClose,
  onSubmit,
  serviceDate,
  onChangeDate,
}: SearchOverlayProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const insets = useSafeAreaInsets();

  const [pickerVisible, setPickerVisible] = useState(false);

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      // Android surfaces a native dialog that dismisses itself; iOS keeps the
      // inline picker open until the customer taps Done.
      if (Platform.OS !== 'ios') setPickerVisible(false);
      if (event.type === 'set' && selected) onChangeDate(selected);
    },
    [onChangeDate],
  );

  const handleSearch = useCallback(() => {
    setPickerVisible(false);
    onSubmit();
  }, [onSubmit]);

  const handleClose = useCallback(() => {
    setPickerVisible(false);
    onClose();
  }, [onClose]);

  const panelBg = isDark ? '#1E1E2E' : '#FFFFFF';
  const fieldBg = isDark ? 'rgba(0,0,0,0.35)' : palette.offWhite;
  const fieldBorder = isDark
    ? 'rgba(160,160,160,0.35)'
    : 'rgba(119,119,119,0.2)';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        {/* Dimmed backdrop — tap anywhere below the panel to dismiss. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        />

        {/* Top-anchored panel */}
        <View
          style={[
            styles.panel,
            { backgroundColor: panelBg, paddingTop: insets.top + spacing.sm },
          ]}
          accessibilityViewIsModal
        >
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={palette.charcoal} strokeWidth={2} />
          </Pressable>

          <Spacer size="md" />

          {/* ── Where ─────────────────────────────────────────── */}
          <Text variant="label" color="charcoal">
            Where
          </Text>
          <Spacer size="sm" />
          <LocationSearchBar
            placeholder="City, address, or zip code"
            onSubmit={handleSearch}
          />

          <Spacer size="lg" />

          {/* ── When ──────────────────────────────────────────── */}
          <Text variant="label" color="charcoal">
            When
          </Text>
          <Spacer size="sm" />
          <Pressable
            onPress={() => setPickerVisible((v) => !v)}
            style={[
              styles.field,
              { backgroundColor: fieldBg, borderColor: fieldBorder },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              serviceDate
                ? `Service date, ${formatDate(serviceDate.toISOString())}`
                : 'Add a service date'
            }
          >
            <Calendar
              size={20}
              color={palette.electricBlue}
              strokeWidth={2}
              style={styles.fieldIcon}
            />
            <Text
              variant="body"
              color={serviceDate ? 'charcoal' : 'midGray'}
              numberOfLines={1}
              style={styles.fieldLabel}
            >
              {serviceDate
                ? formatDate(serviceDate.toISOString())
                : 'Add dates or months'}
            </Text>
          </Pressable>

          {pickerVisible && (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={serviceDate ?? new Date()}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDateChange}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={palette.deepIndigo}
              />
              {Platform.OS === 'ios' && (
                <Button
                  label="Done"
                  variant="ghost"
                  size="sm"
                  onPress={() => setPickerVisible(false)}
                  style={styles.pickerDone}
                />
              )}
            </View>
          )}

          <Spacer size="xl" />

          {/* ── Search ────────────────────────────────────────── */}
          <Button
            label="Search"
            variant="primary"
            size="lg"
            onPress={handleSearch}
            style={styles.searchButton}
          />

          <Spacer size="lg" />
        </View>
      </View>
    </Modal>
  );
}

export default SearchOverlay;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    borderBottomLeftRadius: borderRadius.card,
    borderBottomRightRadius: borderRadius.card,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  // 44×44pt minimum touch target per WCAG 2.1 AA.
  back: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.input,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldIcon: {
    marginRight: spacing.sm,
  },
  fieldLabel: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  pickerWrap: {
    marginTop: spacing.sm,
  },
  pickerDone: {
    alignSelf: 'flex-end',
  },
  searchButton: {
    width: '100%',
  },
});
