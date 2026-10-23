import type { Session } from '@supabase/supabase-js';
import type { User } from '../../types/models';

jest.mock('../../lib/supabase/mutations', () => ({
  insertUser: jest.fn(),
  insertVehicle: jest.fn(),
  insertProviderProfile: jest.fn(),
  deleteUser: jest.fn(),
}));

// Mock the push module so the pure submit logic can be tested without the
// native @react-native-firebase/messaging module, and so we can assert that
// device-token registration is triggered at the end of onboarding.
jest.mock('../../lib/notifications/push', () => ({
  registerPushNotifications: jest.fn().mockResolvedValue('fcm-token'),
}));

import { submitSignUp } from '../signUpSubmit';
import { useAuthStore } from '../auth';
import { useSignUpDraftStore } from '../signUpDraft';
import {
  insertUser,
  insertVehicle,
  insertProviderProfile,
  deleteUser,
} from '../../lib/supabase/mutations';
import { registerPushNotifications } from '../../lib/notifications/push';

const mockInsertUser = insertUser as jest.MockedFunction<typeof insertUser>;
const mockInsertVehicle = insertVehicle as jest.MockedFunction<
  typeof insertVehicle
>;
const mockInsertProviderProfile =
  insertProviderProfile as jest.MockedFunction<typeof insertProviderProfile>;
const mockDeleteUser = deleteUser as jest.MockedFunction<typeof deleteUser>;
const mockRegisterPush = registerPushNotifications as jest.MockedFunction<
  typeof registerPushNotifications
>;

const providerProfileRow = {
  id: 'p1',
  user_id: 'u1',
} as never;

const session = {
  user: { id: 'u1', email: 'jane@example.com', phone: null },
} as unknown as Session;

function newUserRow(role: User['role']): User {
  return {
    id: 'u1',
    email: 'jane@example.com',
    full_name: 'Jane Doe',
    role,
  } as unknown as User;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSignUpDraftStore.getState().reset();
  useAuthStore.getState().setSession(session, null);
  // setSession does not touch providerVerification, so clear it explicitly to
  // keep the per-role assertions below independent of test order.
  useAuthStore.getState().setProviderVerification(null);
  mockInsertVehicle.mockResolvedValue({ data: null, error: null } as never);
  // Provider profile creation succeeds by default; individual tests override.
  mockInsertProviderProfile.mockResolvedValue({
    data: providerProfileRow,
    error: null,
  });
  mockDeleteUser.mockResolvedValue({ data: true, error: null });
});

describe('submitSignUp', () => {
  it('inserts a customer with address + primary vehicle and updates the auth store', async () => {
    mockInsertUser.mockResolvedValue({ data: newUserRow('customer'), error: null });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('customer');
    draft.setProfile({
      fullName: 'Jane Doe',
      phone: '(703) 555-0142',
      addressLine1: '123 Main St',
      city: 'Reston',
      state: 'VA',
      postalCode: '20190',
    });
    draft.setVehicle({ year: '2022', make: 'Honda', model: 'Civic' });

    const result = await submitSignUp();

    expect(result.ok).toBe(true);
    expect(mockInsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u1',
        role: 'customer',
        full_name: 'Jane Doe',
        phone: '(703) 555-0142',
        address_line1: '123 Main St',
        city: 'Reston',
        state: 'VA',
        postal_code: '20190',
      }),
    );
    expect(mockInsertVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        year: '2022',
        make: 'Honda',
        model: 'Civic',
        is_primary: true,
      }),
    );
    // Auth store now holds the new row, and the draft is cleared.
    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(useSignUpDraftStore.getState().fullName).toBe('');
    // Customers do not use provider verification — it stays null so the gate
    // routes them straight into the tabs.
    expect(useAuthStore.getState().providerVerification).toBeNull();
    // End-of-onboarding push registration is triggered for the new user.
    expect(mockRegisterPush).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('inserts a provider without address or vehicle', async () => {
    mockInsertUser.mockResolvedValue({ data: newUserRow('provider'), error: null });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('provider');
    draft.setProfile({ fullName: 'Max Power', phone: '5551234567' });

    const result = await submitSignUp();

    expect(result.ok).toBe(true);
    expect(mockInsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'provider',
        address_line1: null,
        city: null,
        postal_code: null,
      }),
    );
    expect(mockInsertVehicle).not.toHaveBeenCalled();
    // The provider_profiles row is created so the vetting hub has something to
    // read (a DB trigger seeds provider_vetting off it). Without this the
    // provider dead-ends on "We could not find your provider application".
    // provider_type_id is intentionally omitted here — set later in the profile
    // step.
    expect(mockInsertProviderProfile).toHaveBeenCalledWith({ user_id: 'u1' });
    // The freshly-created row defaults to 'pending'. This non-null value is what
    // lets the root auth gate move the provider off the review screen instead of
    // hanging on its spinner.
    expect(useAuthStore.getState().providerVerification).toBe('pending');
  });

  it('resolves provider verification for a hybrid "both" account', async () => {
    mockInsertUser.mockResolvedValue({ data: newUserRow('both'), error: null });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('both');
    draft.setProfile({
      fullName: 'Sam Both',
      phone: '5551234567',
      addressLine1: '1 A St',
      city: 'Reston',
      state: 'VA',
      postalCode: '20190',
    });
    draft.setVehicle({ year: '2021', make: 'Toyota', model: 'Corolla' });

    const result = await submitSignUp();

    expect(result.ok).toBe(true);
    // A `both` account is a provider too, so it gets a provider_profiles row.
    expect(mockInsertProviderProfile).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(useAuthStore.getState().providerVerification).toBe('pending');
  });

  it('rolls back the user and fails when a provider-only profile insert fails', async () => {
    mockInsertUser.mockResolvedValue({ data: newUserRow('provider'), error: null });
    mockInsertProviderProfile.mockResolvedValue({
      data: null,
      error: { message: 'profile insert boom', name: 'PostgrestError' } as never,
    });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('provider');
    draft.setProfile({ fullName: 'Max Power', phone: '5551234567' });

    const result = await submitSignUp();

    // Provider-only is blocked: without the profile row they would dead-end on
    // the vetting hub, so the whole signup fails.
    expect(result.ok).toBe(false);
    expect(result.error).toContain('profile insert boom');
    // The orphaned users row is rolled back so a retry starts clean and the
    // account isn't left stuck half-created.
    expect(mockDeleteUser).toHaveBeenCalledWith('u1');
    // Auth store was never advanced to the new user.
    expect(useAuthStore.getState().user).toBeNull();
    expect(mockRegisterPush).not.toHaveBeenCalled();
  });

  it('lets a "both" account through with a warning when its profile insert fails', async () => {
    mockInsertUser.mockResolvedValue({ data: newUserRow('both'), error: null });
    mockInsertProviderProfile.mockResolvedValue({
      data: null,
      error: { message: 'profile insert boom', name: 'PostgrestError' } as never,
    });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('both');
    draft.setProfile({
      fullName: 'Sam Both',
      phone: '5551234567',
      addressLine1: '1 A St',
      city: 'Reston',
      state: 'VA',
      postalCode: '20190',
    });
    draft.setVehicle({ year: '2021', make: 'Toyota', model: 'Corolla' });

    const result = await submitSignUp();

    // A `both` user is also a customer, so a failed provider profile is
    // non-blocking: they enter the app and can create it later from
    // More → Provider. Nothing is rolled back.
    expect(result.ok).toBe(true);
    expect(result.providerWarning).toBe(true);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });

  it('returns an error and does not touch the auth store when the insert fails', async () => {
    mockInsertUser.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key', name: 'PostgrestError' } as never,
    });

    const draft = useSignUpDraftStore.getState();
    draft.setRole('customer');
    draft.setProfile({ fullName: 'Jane Doe', phone: '5551234567' });
    draft.setVehicle({ year: '2022', make: 'Honda', model: 'Civic' });

    const result = await submitSignUp();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('duplicate key');
    expect(useAuthStore.getState().user).toBeNull();
    // No user row was created, so push registration must not fire.
    expect(mockRegisterPush).not.toHaveBeenCalled();
  });
});
