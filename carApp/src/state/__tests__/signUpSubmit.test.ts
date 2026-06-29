import type { Session } from '@supabase/supabase-js';
import type { User } from '../../types/models';

jest.mock('../../lib/supabase/mutations', () => ({
  insertUser: jest.fn(),
  insertVehicle: jest.fn(),
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
import { insertUser, insertVehicle } from '../../lib/supabase/mutations';
import { registerPushNotifications } from '../../lib/notifications/push';

const mockInsertUser = insertUser as jest.MockedFunction<typeof insertUser>;
const mockInsertVehicle = insertVehicle as jest.MockedFunction<
  typeof insertVehicle
>;
const mockRegisterPush = registerPushNotifications as jest.MockedFunction<
  typeof registerPushNotifications
>;

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
  mockInsertVehicle.mockResolvedValue({ data: null, error: null } as never);
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
