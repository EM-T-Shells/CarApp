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

// Ceiling on a single onboarding write. The Supabase mutations never reject
// (runMutation swallows into a typed error), but they also have no network
// timeout, so a stalled request would otherwise hang the review screen's
// spinner indefinitely. Race each write against this so a stall surfaces as a
// normal typed error the caller can show and recover from.
const WRITE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), WRITE_TIMEOUT_MS);
  });
  // A late resolve of `promise` after the timeout is harmless — it never
  // rejects, so there is no unhandled rejection, and the result is ignored.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function submitSignUp(): Promise<SignUpSubmitResult> {
  const { session, setSession, setProviderVerification } =
    useAuthStore.getState();
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

  const userResult = await withTimeout(insertUser(payload), {
    data: null,
    error: new Error(
      'Timed out saving your profile. Check your connection and try again.',
    ),
  });
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
    const vehicleResult = await withTimeout(insertVehicle(vehiclePayload), {
      data: null,
      error: new Error('Timed out saving your vehicle.'),
    });
    // Non-blocking: the user row is saved, so let them into the app and
    // surface a soft warning — they can add the vehicle later in Account.
    if (vehicleResult.error) vehicleWarning = true;
  }

  // Hand the new user row to the auth store so the root gate routes into
  // the main nav instead of looping back to (auth)/.
  setSession(session, newUser);

  // Resolve the provider verification status for the newly-inserted row. The
  // root auth gate (app/_layout.tsx) holds provider-only accounts until
  // `providerVerification` is non-null, and this in-place users-row insert does
  // NOT trigger the root layout's hydrate() (the auth session is unchanged), so
  // without this the gate would deadlock and leave the review screen spinning
  // forever. A brand-new provider/both account has no provider_profiles row yet,
  // so its status is 'pending'; customers don't use this field (null), mirroring
  // hydrate().
  setProviderVerification(
    newUser.role === 'provider' || newUser.role === 'both' ? 'pending' : null,
  );

  useSignUpDraftStore.getState().reset();

  // End-of-onboarding push registration. The root layout's hydrate() does
  // not re-run for this in-place users-row insert, so register the device
  // token here. Fire-and-forget — a denied prompt or token failure must not
  // block the user from entering the app (the module swallows both).
  void registerPushNotifications({ userId: newUser.id });

  return { ok: true, vehicleWarning };
}
