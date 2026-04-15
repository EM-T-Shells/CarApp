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
} from '../bookingDraft';
import type { ServicePackage } from '../../types/models';

// ── Fixtures ──────────────────────────────────────────────────────────

const makePkg = (overrides: Partial<ServicePackage> = {}): ServicePackage =>
  ({
    id: 'pkg-1',
    provider_id: 'prov-1',
    catalog_id: null,
    name: 'Interior Detail',
    description: 'Full interior cleaning',
    category: 'detailing',
    base_price: 120.0,
    duration_mins: 90,
    is_active: true,
    is_custom: false,
    is_approved: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as ServicePackage;

const pkg1 = makePkg();
const pkg2 = makePkg({
  id: 'pkg-2',
  name: 'Exterior Wash',
  base_price: 50.0,
  duration_mins: 45,
});

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  useBookingDraftStore.getState().reset();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('useBookingDraftStore', () => {
  it('starts with empty initial state', () => {
    const state = useBookingDraftStore.getState();
    expect(state.providerId).toBeNull();
    expect(state.providerName).toBeNull();
    expect(state.selectedServices).toEqual([]);
    expect(state.vehicleId).toBeNull();
    expect(state.serviceAddress).toBe('');
    expect(state.scheduledAt).toBeNull();
    expect(state.notes).toBe('');
  });

  it('setProvider updates provider fields', () => {
    useBookingDraftStore.getState().setProvider('prov-1', 'John Doe');
    const state = useBookingDraftStore.getState();
    expect(state.providerId).toBe('prov-1');
    expect(state.providerName).toBe('John Doe');
  });

  it('toggleService adds a service snapshot with price in cents', () => {
    useBookingDraftStore.getState().toggleService(pkg1);
    const services = useBookingDraftStore.getState().selectedServices;
    expect(services).toHaveLength(1);
    expect(services[0].id).toBe('pkg-1');
    expect(services[0].name).toBe('Interior Detail');
    expect(services[0].base_price).toBe(12000); // $120.00 → 12000 cents
  });

  it('toggleService removes a service when toggled again', () => {
    useBookingDraftStore.getState().toggleService(pkg1);
    expect(useBookingDraftStore.getState().selectedServices).toHaveLength(1);

    useBookingDraftStore.getState().toggleService(pkg1);
    expect(useBookingDraftStore.getState().selectedServices).toHaveLength(0);
  });

  it('toggleService supports multiple services', () => {
    useBookingDraftStore.getState().toggleService(pkg1);
    useBookingDraftStore.getState().toggleService(pkg2);
    expect(useBookingDraftStore.getState().selectedServices).toHaveLength(2);

    // Remove first, keep second
    useBookingDraftStore.getState().toggleService(pkg1);
    const services = useBookingDraftStore.getState().selectedServices;
    expect(services).toHaveLength(1);
    expect(services[0].id).toBe('pkg-2');
  });

  it('setVehicleId updates the vehicle selection', () => {
    useBookingDraftStore.getState().setVehicleId('veh-1');
    expect(useBookingDraftStore.getState().vehicleId).toBe('veh-1');
  });

  it('setServiceAddress updates the address', () => {
    useBookingDraftStore.getState().setServiceAddress('123 Main St');
    expect(useBookingDraftStore.getState().serviceAddress).toBe('123 Main St');
  });

  it('setLocation updates lat/lng', () => {
    useBookingDraftStore.getState().setLocation(38.8977, -77.0365);
    const state = useBookingDraftStore.getState();
    expect(state.locationLat).toBe(38.8977);
    expect(state.locationLng).toBe(-77.0365);
  });

  it('setScheduledAt updates the scheduled time', () => {
    const iso = '2026-05-01T14:00:00Z';
    useBookingDraftStore.getState().setScheduledAt(iso);
    expect(useBookingDraftStore.getState().scheduledAt).toBe(iso);
  });

  it('setNotes updates notes', () => {
    useBookingDraftStore.getState().setNotes('Park in the driveway');
    expect(useBookingDraftStore.getState().notes).toBe('Park in the driveway');
  });

  it('reset clears all fields', () => {
    useBookingDraftStore.getState().setProvider('prov-1', 'John');
    useBookingDraftStore.getState().toggleService(pkg1);
    useBookingDraftStore.getState().setVehicleId('veh-1');
    useBookingDraftStore.getState().setServiceAddress('123 Main');
    useBookingDraftStore.getState().setScheduledAt('2026-05-01T14:00:00Z');
    useBookingDraftStore.getState().setNotes('Test');

    useBookingDraftStore.getState().reset();
    const state = useBookingDraftStore.getState();
    expect(state.providerId).toBeNull();
    expect(state.selectedServices).toEqual([]);
    expect(state.vehicleId).toBeNull();
    expect(state.serviceAddress).toBe('');
    expect(state.scheduledAt).toBeNull();
    expect(state.notes).toBe('');
  });
});

describe('selectors', () => {
  it('selectSubtotalCents sums service prices', () => {
    useBookingDraftStore.getState().toggleService(pkg1); // 12000
    useBookingDraftStore.getState().toggleService(pkg2); // 5000
    expect(selectSubtotalCents(useBookingDraftStore.getState())).toBe(17000);
  });

  it('selectServiceFeeCents returns 2% of subtotal', () => {
    useBookingDraftStore.getState().toggleService(pkg1); // 12000
    // 2% of 12000 = 240
    expect(selectServiceFeeCents(useBookingDraftStore.getState())).toBe(240);
  });

  it('selectTotalCents returns subtotal + service fee', () => {
    useBookingDraftStore.getState().toggleService(pkg1); // 12000
    // 12000 + 240 = 12240
    expect(selectTotalCents(useBookingDraftStore.getState())).toBe(12240);
  });

  it('selectDepositCents returns 15% of total', () => {
    useBookingDraftStore.getState().toggleService(pkg1);
    const total = selectTotalCents(useBookingDraftStore.getState()); // 12240
    // 15% of 12240 = 1836
    expect(selectDepositCents(useBookingDraftStore.getState())).toBe(
      Math.floor(total * 0.15),
    );
  });

  it('selectBalanceCents returns total minus deposit', () => {
    useBookingDraftStore.getState().toggleService(pkg1);
    const state = useBookingDraftStore.getState();
    const total = selectTotalCents(state);
    const deposit = selectDepositCents(state);
    expect(selectBalanceCents(state)).toBe(total - deposit);
  });

  it('selectEstimatedDuration sums durations', () => {
    useBookingDraftStore.getState().toggleService(pkg1); // 90
    useBookingDraftStore.getState().toggleService(pkg2); // 45
    expect(selectEstimatedDuration(useBookingDraftStore.getState())).toBe(135);
  });

  it('selectHasServices returns true when services selected', () => {
    expect(selectHasServices(useBookingDraftStore.getState())).toBe(false);
    useBookingDraftStore.getState().toggleService(pkg1);
    expect(selectHasServices(useBookingDraftStore.getState())).toBe(true);
  });

  it('selectIsReadyToBook requires all fields', () => {
    expect(selectIsReadyToBook(useBookingDraftStore.getState())).toBe(false);

    useBookingDraftStore.getState().setProvider('prov-1', 'John');
    useBookingDraftStore.getState().toggleService(pkg1);
    useBookingDraftStore.getState().setVehicleId('veh-1');
    useBookingDraftStore.getState().setServiceAddress('123 Main St');
    expect(selectIsReadyToBook(useBookingDraftStore.getState())).toBe(false);

    useBookingDraftStore.getState().setScheduledAt('2026-05-01T14:00:00Z');
    expect(selectIsReadyToBook(useBookingDraftStore.getState())).toBe(true);
  });

  it('selectIsReadyToBook is false with whitespace-only address', () => {
    useBookingDraftStore.getState().setProvider('prov-1', 'John');
    useBookingDraftStore.getState().toggleService(pkg1);
    useBookingDraftStore.getState().setVehicleId('veh-1');
    useBookingDraftStore.getState().setServiceAddress('   ');
    useBookingDraftStore.getState().setScheduledAt('2026-05-01T14:00:00Z');
    expect(selectIsReadyToBook(useBookingDraftStore.getState())).toBe(false);
  });
});
