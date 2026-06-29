// signUpSubmit — the single write path that finalizes onboarding.
//
// Reads the accumulated useSignUpDraftStore + the authenticated session,
// inserts the `users` row (plus the primary `vehicles` row for customer /
// both accounts), pushes the new row into useAuthStore, and resets the
// draft. The root auth gate then routes the user into the main nav.
//
// Both the vehicle step (customer / both) and the provider-only review
// screen call this so there is exactly one insert path.

import { useAuthStore } from './auth';
import { useSignUpDraftStore } from './signUpDraft';
import { insertUser, insertVehicle } from '../lib/supabase/mutations';
import { registerPushNotifications } from '../lib/notifications/push';
import type { UserInsert, VehicleInsert } from '../types/models';

export interface SignUpSubmitResult {
  ok: boolean;
  /** Set when the user row saved but a non-blocking step (vehicle) failed. */
  vehicleWarning?: boolean;
  error?: string;
}

export async function submitSignUp(): Promise<SignUpSubmitResult> {
  const { session, setSession } = useAuthStore.getState();
  const draft = useSignUpDraftStore.getState();

  if (!session?.user) {
    return { ok: false, error: 'Your session expired. Please sign in again.' };
  }
  if (!draft.role) {
    return { ok: false, error: 'Please choose how you plan to use CarApp.' };
  }

  const authUser = session.user;
  const isCustomerLike = draft.role === 'customer' || draft.role === 'both';

  const payload: UserInsert = {
    id: authUser.id,
    email: authUser.email ?? null,
    phone: draft.phone.trim() || authUser.phone || null,
    full_name: draft.fullName.trim(),
    role: draft.role,
    email_verified: Boolean(authUser.email),
    phone_verified: Boolean(authUser.phone),
    address_line1: isCustomerLike ? draft.addressLine1.trim() || null : null,
    address_line2: isCustomerLike ? draft.addressLine2.trim() || null : null,
    city: isCustomerLike ? draft.city.trim() || null : null,
    state: isCustomerLike ? draft.state.trim() || null : null,
    postal_code: isCustomerLike ? draft.postalCode.trim() || null : null,
  };

  const userResult = await insertUser(payload);
  if (userResult.error || !userResult.data) {
    return {
      ok: false,
      error:
        userResult.error?.message ??
        'Could not save your profile. Please try again.',
    };
  }
  const newUser = userResult.data;

  let vehicleWarning = false;
  if (isCustomerLike) {
    const vehiclePayload: VehicleInsert = {
      user_id: newUser.id,
      year: draft.vehicle.year.trim(),
      make: draft.vehicle.make.trim(),
      model: draft.vehicle.model.trim(),
      trim: draft.vehicle.trim?.trim() || null,
      color: draft.vehicle.color?.trim() || null,
      license_plate: draft.vehicle.licensePlate?.trim() || null,
      is_primary: true,
    };
    const vehicleResult = await insertVehicle(vehiclePayload);
    // Non-blocking: the user row is saved, so let them into the app and
    // surface a soft warning — they can add the vehicle later in Account.
    if (vehicleResult.error) vehicleWarning = true;
  }

  // Hand the new user row to the auth store so the root gate routes into
  // the main nav instead of looping back to (auth)/.
  setSession(session, newUser);
  useSignUpDraftStore.getState().reset();

  // End-of-onboarding push registration. The root layout's hydrate() does
  // not re-run for this in-place users-row insert, so register the device
  // token here. Fire-and-forget — a denied prompt or token failure must not
  // block the user from entering the app (the module swallows both).
  void registerPushNotifications({ userId: newUser.id });

  return { ok: true, vehicleWarning };
}
