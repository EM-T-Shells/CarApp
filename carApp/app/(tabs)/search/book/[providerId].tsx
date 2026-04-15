// Booking flow — multi-step screen where a customer books a provider.
// Steps: 1. Select services → 2. Vehicle + Address + Schedule → 3. Review & Pay
//
// Uses the bookingDraft Zustand store to accumulate state across steps.
// On confirmation, creates a booking row via mutations.ts, then calls
// the Stripe Edge Function for the 15% deposit payment intent.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  Car,
} from 'lucide-react-native';
import { Text } from '../../../../src/components/ui/Text';
import { Button } from '../../../../src/components/ui/Button';
import { Card } from '../../../../src/components/ui/Card';
import { Spacer } from '../../../../src/components/ui/Spacer';
import { TextField } from '../../../../src/components/ui/TextField';
import { AddressPicker } from '../../../../src/components/booking/AddressPicker';
import { DateTimePicker } from '../../../../src/components/booking/DateTimePicker';
import { PriceBreakdown } from '../../../../src/components/booking/PriceBreakdown';
import { DepositSummary } from '../../../../src/components/booking/DepositSummary';
import { colors, spacing, borderRadius } from '../../../../src/design/tokens';
import { centsToDisplay } from '../../../../src/utils/money';
import { getProviderById } from '../../../../src/lib/supabase/queries';
import { getVehiclesByUser } from '../../../../src/lib/supabase/queries';
import { insertBooking } from '../../../../src/lib/supabase/mutations';
import { createDepositPaymentIntent, confirmDepositPayment } from '../../../../src/lib/stripe';
import { useAuthStore } from '../../../../src/state/auth';
import {
  useBookingDraftStore,
  selectSubtotalCents,
  selectServiceFeeCents,
  selectTotalCents,
  selectDepositCents,
  selectBalanceCents,
  selectEstimatedDuration,
  selectIsReadyToBook,
  selectHasServices,
} from '../../../../src/state/bookingDraft';
import type { ProviderDetail } from '../../../../src/lib/supabase/queries';
import type { ServicePackage, Vehicle } from '../../../../src/types/models';
import type { BookProviderParams } from '../../../../src/types/navigation';
import { formatDateTime } from '../../../../src/utils/date';
import {
  calculateDeposit,
  calculateServiceFee,
  calculatePlatformFee,
  calculateProviderPayout,
} from '../../../../src/utils/money';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

// ── Step Enum ────────────────────────────────────────────────────────

const STEPS = ['Services', 'Details', 'Review'] as const;
type Step = (typeof STEPS)[number];

// ── Screen ───────────────────────────────────────────────────────────

export default function BookProviderScreen(): React.ReactElement {
  const { providerId } = useLocalSearchParams<BookProviderParams>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const user = useAuthStore((s) => s.user);

  // Draft store
  const draft = useBookingDraftStore();
  const subtotal = useBookingDraftStore(selectSubtotalCents);
  const serviceFee = useBookingDraftStore(selectServiceFeeCents);
  const total = useBookingDraftStore(selectTotalCents);
  const deposit = useBookingDraftStore(selectDepositCents);
  const balance = useBookingDraftStore(selectBalanceCents);
  const duration = useBookingDraftStore(selectEstimatedDuration);
  const isReady = useBookingDraftStore(selectIsReadyToBook);
  const hasServices = useBookingDraftStore(selectHasServices);

  // Local state
  const [stepIndex, setStepIndex] = useState(0);
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const currentStep = STEPS[stepIndex];

  // ── Load provider + vehicles on mount ────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const [providerRes, vehiclesRes] = await Promise.all([
        getProviderById(providerId),
        user ? getVehiclesByUser(user.id) : Promise.resolve({ data: [] as Vehicle[], error: null }),
      ]);

      if (cancelled) return;

      if (providerRes.error) {
        setError(providerRes.error);
        setIsLoading(false);
        return;
      }

      setProvider(providerRes.data);
      draft.setProvider(
        providerRes.data.id,
        providerRes.data.users?.full_name ?? 'Provider',
      );

      if (vehiclesRes.data) {
        setVehicles(vehiclesRes.data);
        // Auto-select primary vehicle
        const primary = vehiclesRes.data.find((v) => v.is_primary);
        if (primary) {
          draft.setVehicleId(primary.id);
        } else if (vehiclesRes.data.length === 1) {
          draft.setVehicleId(vehiclesRes.data[0].id);
        }
      }

      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [providerId, user?.id]);

  // ── Clean up on unmount ──────────────────────────────────────────

  useEffect(() => {
    return () => {
      draft.reset();
    };
  }, []);

  // ── Navigation ───────────────────────────────────────────────────

  const canGoNext = useMemo(() => {
    if (currentStep === 'Services') return hasServices;
    if (currentStep === 'Details') {
      return (
        draft.vehicleId !== null &&
        draft.serviceAddress.trim().length > 0 &&
        draft.scheduledAt !== null
      );
    }
    return isReady;
  }, [currentStep, hasServices, draft.vehicleId, draft.serviceAddress, draft.scheduledAt, isReady]);

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      router.back();
    }
  }, [stepIndex, router]);

  // ── Submit booking ───────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!user || !provider || !isReady) return;

    setIsSubmitting(true);

    const platformFeeRate = Number(provider.platform_fee_rate ?? 0.05);
    const totalCents = total;
    const depositCents = deposit;
    const serviceFeeCents = serviceFee;
    const platformFeeCents = calculatePlatformFee(subtotal, platformFeeRate);
    const providerPayoutCents = calculateProviderPayout(subtotal, platformFeeRate);

    // Snapshot services as JSONB
    const servicesSnapshot = draft.selectedServices.map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      category: svc.category,
      base_price: svc.base_price,
      duration_mins: svc.duration_mins,
    }));

    // 1. Create booking row
    const bookingResult = await insertBooking({
      customer_id: user.id,
      provider_id: provider.id,
      vehicle_id: draft.vehicleId,
      services: servicesSnapshot,
      status: 'pending',
      total_amount: totalCents / 100,
      deposit_amount: depositCents / 100,
      platform_fee: platformFeeCents / 100,
      service_fee: serviceFeeCents / 100,
      provider_payout: providerPayoutCents / 100,
      service_address: draft.serviceAddress,
      location_lat: draft.locationLat,
      location_lng: draft.locationLng,
      notes: draft.notes || null,
      scheduled_at: draft.scheduledAt!,
    });

    if (bookingResult.error) {
      setIsSubmitting(false);
      Alert.alert('Booking Failed', bookingResult.error.message);
      return;
    }

    const booking = bookingResult.data;

    // 2. Create deposit payment intent
    const intentResult = await createDepositPaymentIntent(
      booking.id,
      depositCents,
    );

    if (intentResult.error) {
      setIsSubmitting(false);
      Alert.alert('Payment Setup Failed', intentResult.error.message);
      return;
    }

    // 3. Confirm the payment via Stripe SDK
    const confirmResult = await confirmDepositPayment(
      intentResult.data.clientSecret,
    );

    setIsSubmitting(false);

    if (confirmResult.error) {
      Alert.alert('Payment Failed', confirmResult.error.message);
      return;
    }

    // Success — navigate to the booking detail screen
    draft.reset();
    router.replace(`/bookings/${booking.id}`);
  }, [user, provider, isReady, total, deposit, serviceFee, subtotal, draft, router]);

  // ── Loading state ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Book' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </>
    );
  }

  // ── Error state ──────────────────────────────────────────────────

  if (error || !provider) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
          <Text variant="subheading" color="charcoal">
            Could not load provider
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray">
            {error?.message ?? 'Provider not found'}
          </Text>
          <Spacer size="lg" />
          <Button label="Go Back" variant="primary" onPress={() => router.back()} />
        </View>
      </>
    );
  }

  const providerName = provider.users?.full_name ?? 'Provider';

  // ── Render ───────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: `Book ${providerName}` }} />
      <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      i <= stepIndex ? palette.deepIndigo : palette.midGray,
                  },
                ]}
              >
                {i < stepIndex ? (
                  <Check size={12} color={palette.offWhite} strokeWidth={3} />
                ) : (
                  <Text
                    variant="caption"
                    style={{ color: palette.offWhite, fontWeight: '700' }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                color={i <= stepIndex ? 'charcoal' : 'midGray'}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>

        {/* Step content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 'Services' && (
            <StepServices
              packages={provider.service_packages}
              selectedIds={draft.selectedServices.map((s) => s.id)}
              onToggle={draft.toggleService}
              palette={palette}
              isDark={isDark}
            />
          )}

          {currentStep === 'Details' && (
            <StepDetails
              vehicles={vehicles}
              selectedVehicleId={draft.vehicleId}
              onSelectVehicle={draft.setVehicleId}
              address={draft.serviceAddress}
              onChangeAddress={draft.setServiceAddress}
              scheduledAt={draft.scheduledAt}
              onChangeSchedule={draft.setScheduledAt}
              notes={draft.notes}
              onChangeNotes={draft.setNotes}
              palette={palette}
              isDark={isDark}
            />
          )}

          {currentStep === 'Review' && (
            <StepReview
              providerName={providerName}
              services={draft.selectedServices}
              serviceFeeCents={serviceFee}
              totalCents={total}
              depositCents={deposit}
              balanceCents={balance}
              durationMins={duration}
              scheduledAt={draft.scheduledAt}
              address={draft.serviceAddress}
              vehicleName={
                vehicles.find((v) => v.id === draft.vehicleId)
                  ? `${vehicles.find((v) => v.id === draft.vehicleId)!.year} ${vehicles.find((v) => v.id === draft.vehicleId)!.make} ${vehicles.find((v) => v.id === draft.vehicleId)!.model}`
                  : ''
              }
            />
          )}

          <Spacer size={120} />
        </ScrollView>

        {/* Bottom navigation bar */}
        <SafeAreaView edges={['bottom']} style={styles.stickyFooter}>
          <View
            style={[
              styles.footerInner,
              {
                backgroundColor: palette.offWhite,
                borderTopColor: isDark ? '#2A2A3E' : '#E5E7EB',
              },
            ]}
          >
            <View style={styles.footerRow}>
              {stepIndex > 0 ? (
                <Button
                  label="Back"
                  variant="ghost"
                  size="md"
                  onPress={goBack}
                  leftIcon={
                    <ChevronLeft
                      size={18}
                      color={palette.midGray}
                      strokeWidth={2}
                    />
                  }
                  style={styles.backButton}
                />
              ) : (
                <View style={styles.backButton} />
              )}

              {currentStep === 'Review' ? (
                <Button
                  label={`Pay ${centsToDisplay(deposit)} Deposit`}
                  variant="primary"
                  size="lg"
                  onPress={handleConfirm}
                  loading={isSubmitting}
                  disabled={!isReady}
                  style={styles.nextButton}
                />
              ) : (
                <Button
                  label="Continue"
                  variant="primary"
                  size="lg"
                  onPress={goNext}
                  disabled={!canGoNext}
                  rightIcon={
                    <ChevronRight
                      size={18}
                      color={palette.offWhite}
                      strokeWidth={2}
                    />
                  }
                  style={styles.nextButton}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}

// ── Step 1: Services ─────────────────────────────────────────────────

interface StepServicesProps {
  packages: ServicePackage[];
  selectedIds: string[];
  onToggle: (pkg: ServicePackage) => void;
  palette: typeof colors.light;
  isDark: boolean;
}

function StepServices({
  packages,
  selectedIds,
  onToggle,
  palette,
  isDark,
}: StepServicesProps): React.ReactElement {
  if (packages.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text variant="body" color="midGray">
          This provider has no services available.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text variant="subheading" color="charcoal">
        Select Services
      </Text>
      <Spacer size="sm" />
      <Text variant="body" color="midGray">
        Choose one or more services for your booking.
      </Text>
      <Spacer size="lg" />

      {packages.map((pkg) => {
        const isSelected = selectedIds.includes(pkg.id);
        return (
          <Pressable
            key={pkg.id}
            onPress={() => onToggle(pkg)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${pkg.name} — ${centsToDisplay(Math.round(Number(pkg.base_price ?? 0) * 100))}`}
          >
            <Card
              variant={isSelected ? 'elevated' : 'outlined'}
              style={[
                styles.serviceCard,
                isSelected && {
                  borderWidth: 2,
                  borderColor: palette.deepIndigo,
                },
              ]}
            >
              <View style={styles.serviceRow}>
                <View style={styles.serviceInfo}>
                  <Text variant="body" color="charcoal">
                    {pkg.name}
                  </Text>
                  {pkg.description != null && pkg.description.length > 0 && (
                    <Text variant="caption" color="midGray" numberOfLines={2}>
                      {pkg.description}
                    </Text>
                  )}
                  {pkg.duration_mins != null && (
                    <View style={styles.durationRow}>
                      <Clock
                        size={12}
                        color={palette.midGray}
                        strokeWidth={2}
                      />
                      <Text variant="caption" color="midGray">
                        {formatDuration(pkg.duration_mins)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.serviceRight}>
                  <Text variant="price" color="charcoal">
                    {centsToDisplay(
                      Math.round(Number(pkg.base_price ?? 0) * 100),
                    )}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: isSelected
                          ? palette.deepIndigo
                          : 'transparent',
                        borderColor: isSelected
                          ? palette.deepIndigo
                          : palette.midGray,
                      },
                    ]}
                  >
                    {isSelected && (
                      <Check
                        size={14}
                        color={palette.offWhite}
                        strokeWidth={3}
                      />
                    )}
                  </View>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Step 2: Details ──────────────────────────────────────────────────

interface StepDetailsProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  address: string;
  onChangeAddress: (address: string) => void;
  scheduledAt: string | null;
  onChangeSchedule: (iso: string) => void;
  notes: string;
  onChangeNotes: (notes: string) => void;
  palette: typeof colors.light;
  isDark: boolean;
}

function StepDetails({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  address,
  onChangeAddress,
  scheduledAt,
  onChangeSchedule,
  notes,
  onChangeNotes,
  palette,
  isDark,
}: StepDetailsProps): React.ReactElement {
  return (
    <View>
      {/* Vehicle selection */}
      <Text variant="subheading" color="charcoal">
        Your Vehicle
      </Text>
      <Spacer size="sm" />

      {vehicles.length === 0 ? (
        <Text variant="body" color="midGray">
          No vehicles found. Add a vehicle in your profile first.
        </Text>
      ) : (
        vehicles.map((v) => {
          const isSelected = v.id === selectedVehicleId;
          const label = `${v.year} ${v.make} ${v.model}${v.color ? ` (${v.color})` : ''}`;
          return (
            <Pressable
              key={v.id}
              onPress={() => onSelectVehicle(v.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={label}
            >
              <Card
                variant={isSelected ? 'elevated' : 'outlined'}
                style={[
                  styles.vehicleCard,
                  isSelected && {
                    borderWidth: 2,
                    borderColor: palette.deepIndigo,
                  },
                ]}
              >
                <View style={styles.vehicleRow}>
                  <Car
                    size={18}
                    color={isSelected ? palette.deepIndigo : palette.midGray}
                    strokeWidth={2}
                  />
                  <Text
                    variant="body"
                    color={isSelected ? 'charcoal' : 'midGray'}
                    style={styles.vehicleLabel}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isSelected
                          ? palette.deepIndigo
                          : palette.midGray,
                      },
                    ]}
                  >
                    {isSelected && (
                      <View
                        style={[
                          styles.radioFill,
                          { backgroundColor: palette.deepIndigo },
                        ]}
                      />
                    )}
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}

      <Spacer size="xl" />

      {/* Address */}
      <AddressPicker
        value={address}
        onChangeText={onChangeAddress}
      />

      <Spacer size="xl" />

      {/* Date/time */}
      <DateTimePicker
        value={scheduledAt}
        onChange={onChangeSchedule}
      />

      <Spacer size="xl" />

      {/* Notes */}
      <TextField
        label="Notes (optional)"
        placeholder="Any special instructions for the provider"
        value={notes}
        onChangeText={onChangeNotes}
        multiline
      />
    </View>
  );
}

// ── Step 3: Review ───────────────────────────────────────────────────

interface StepReviewProps {
  providerName: string;
  services: { id: string; name: string; base_price: number; duration_mins: number | null; description: string | null; category: string }[];
  serviceFeeCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  durationMins: number;
  scheduledAt: string | null;
  address: string;
  vehicleName: string;
}

function StepReview({
  providerName,
  services,
  serviceFeeCents,
  totalCents,
  depositCents,
  balanceCents,
  durationMins,
  scheduledAt,
  address,
  vehicleName,
}: StepReviewProps): React.ReactElement {
  return (
    <View>
      <Text variant="subheading" color="charcoal">
        Review Your Booking
      </Text>
      <Spacer size="lg" />

      {/* Booking details summary */}
      <Card variant="outlined">
        <Text variant="label" color="charcoal">
          Booking Details
        </Text>
        <Spacer size="md" />

        <View style={styles.reviewLine}>
          <Text variant="body" color="midGray">Provider</Text>
          <Text variant="body" color="charcoal">{providerName}</Text>
        </View>
        <View style={styles.reviewLine}>
          <Text variant="body" color="midGray">Vehicle</Text>
          <Text variant="body" color="charcoal">{vehicleName}</Text>
        </View>
        <View style={styles.reviewLine}>
          <Text variant="body" color="midGray">Address</Text>
          <Text variant="body" color="charcoal" style={styles.reviewValue}>
            {address}
          </Text>
        </View>
        {scheduledAt && (
          <View style={styles.reviewLine}>
            <Text variant="body" color="midGray">When</Text>
            <Text variant="body" color="charcoal">
              {formatDateTime(scheduledAt)}
            </Text>
          </View>
        )}
        {durationMins > 0 && (
          <View style={styles.reviewLine}>
            <Text variant="body" color="midGray">Est. Duration</Text>
            <Text variant="body" color="charcoal">
              {formatDuration(durationMins)}
            </Text>
          </View>
        )}
      </Card>

      <Spacer size="lg" />

      {/* Price breakdown */}
      <PriceBreakdown
        services={services}
        serviceFeeCents={serviceFeeCents}
        totalCents={totalCents}
      />

      <Spacer size="lg" />

      {/* Deposit summary */}
      <DepositSummary
        totalCents={totalCents}
        depositCents={depositCents}
        balanceCents={balanceCents}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

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
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing['2xl'],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  stepItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.base,
  },
  emptyState: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  serviceCard: {
    marginBottom: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  serviceInfo: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  serviceRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleCard: {
    marginBottom: spacing.sm,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  vehicleLabel: {
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  reviewLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  reviewValue: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerInner: {
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 80,
  },
  nextButton: {
    flex: 1,
  },
});
