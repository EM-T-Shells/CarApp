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
import {
  deleteUser,
  insertProviderProfile,
  insertUser,
  insertVehicle,
} from '../lib/supabase/mutations';
import { registerPushNotifications } from '../lib/notifications/push';
import type { UserInsert, VehicleInsert } from '../types/models';

export interface SignUpSubmitResult {
  ok: boolean;
  /** Set when the user row saved but a non-blocking step (vehicle) failed. */
  vehicleWarning?: boolean;
  /**
   * Set when a `both` account saved but its provider_profiles row failed to
   * create. Non-blocking — they can create it later from More → Provider.
   */
  providerWarning?: boolean;
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
  const isProviderLike = draft.role === 'provider' || draft.role === 'both';

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

  // Provider / both accounts need a provider_profiles row so the vetting flow
  // has something to read — a DB trigger seeds the provider_vetting row off it.
  // provider_type_id is left null here (onboarding doesn't ask for it) and set
  // later from the profile step.
  //
  // Severity differs by role:
  //   • provider-only — BLOCKING. Without the row the root gate parks them on
  //     pending-approval and "Continue your application" dead-ends on the
  //     vetting hub ("We could not find your provider application"), with no way
  //     forward. Roll the users row back (a provider-only signup has no vehicle,
  //     and the FKs are ON DELETE CASCADE anyway) so the account isn't stuck
  //     half-created and a retry starts clean.
  //   • both — non-blocking. They're also a customer, so let them into the app
  //     with a soft warning; they can create the profile later from
  //     More → Provider ("Start application"), same as a customer opting in.
  let providerWarning = false;
  if (isProviderLike) {
    const profileResult = await withTimeout(
      insertProviderProfile({ user_id: newUser.id }),
      {
        data: null,
        error: new Error(
          'Timed out setting up your provider application. Check your connection and try again.',
        ),
      },
    );
    if (profileResult.error || !profileResult.data) {
      if (draft.role === 'provider') {
        await deleteUser(newUser.id);
        return {
          ok: false,
          error:
            profileResult.error?.message ??
            'Could not set up your provider application. Please try again.',
        };
      }
      providerWarning = true;
    }
  }

  // Hand the new user row to the auth store so the root gate routes into
  // the main nav instead of looping back to (auth)/.
  setSession(session, newUser);

  // Resolve the provider verification status for the newly-inserted row. The
  // root auth gate (app/_layout.tsx) holds provider-only accounts until
  // `providerVerification` is non-null, and this in-place users-row insert does
  // NOT trigger the root layout's hydrate() (the auth session is unchanged), so
  // without this the gate would deadlock and leave the review screen spinning
  // forever. The provider_profiles row we just created defaults to 'pending';
  // customers don't use this field (null), mirroring hydrate().
  setProviderVerification(isProviderLike ? 'pending' : null);

  useSignUpDraftStore.getState().reset();

  // End-of-onboarding push registration. The root layout's hydrate() does
  // not re-run for this in-place users-row insert, so register the device
  // token here. Fire-and-forget — a denied prompt or token failure must not
  // block the user from entering the app (the module swallows both).
  void registerPushNotifications({ userId: newUser.id });

  return { ok: true, vehicleWarning, providerWarning };
}
