# CarApp — Google SSO Auth Flow

This document describes how Google sign-in **should** work in CarApp, the files involved, the configuration required outside the codebase (Google Cloud Console + Supabase), and a debugging checklist for when it doesn't behave.

The focus is **Google SSO only**. Apple SSO uses the same plumbing; OTP is a different path.

---

## 1. End-to-end flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  User taps  │ ──► │ App opens    │ ──► │ User picks  │
│  app icon   │     │ splash       │     │ Google      │
└─────────────┘     │ (auth)/index │     │ on sign-in  │
                    └──────────────┘     └──────┬──────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────┐
│ src/lib/supabase/auth.ts → signInWithGoogle()               │
│   1. supabase.auth.signInWithOAuth({ provider: 'google' })   │
│      → returns an authorize URL                              │
│   2. WebBrowser.openAuthSessionAsync(url, redirectUri)       │
│      → opens system browser, user picks Google account       │
│   3. Browser redirects back to redirectUri with tokens in    │
│      URL fragment: #access_token=…&refresh_token=…           │
│   4. supabase.auth.setSession({ access_token, refresh_token })│
└──────────────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ app/_layout.tsx → onAuthStateChange fires                   │
│   → fetches users row from public.users                      │
│   → hydrates Zustand auth store                              │
│   → useProtectedRoute() reroutes to /(tabs)                  │
└──────────────────────────────────────────────────────────────┘
```

The screen that initiates the sign-in does **not** navigate after success. The root auth gate (`app/_layout.tsx`) is the single source of truth for routing based on auth state.

---

## 2. Files involved

### App code

| File | Role |
|---|---|
| [carApp/app.json](carApp/app.json) | Declares `scheme: "carapp"` (drives the OAuth redirect URI) and `bundleIdentifier`/`package` `com.emre.carapp` |
| [carApp/.env.local](carApp/.env.local) | Holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` — required by the client |
| [carApp/src/lib/supabase/client.ts](carApp/src/lib/supabase/client.ts) | Initializes the Supabase JS client (singleton) |
| [carApp/src/lib/supabase/auth.ts](carApp/src/lib/supabase/auth.ts) | Owns `signInWithGoogle()` — builds the OAuth URL, opens the browser, parses tokens, calls `setSession` |
| [carApp/src/state/auth.ts](carApp/src/state/auth.ts) | Zustand store: `session`, `user`, `role`, `isHydrating` |
| [carApp/app/_layout.tsx](carApp/app/_layout.tsx) | Root layout. Subscribes to `onAuthStateChange`, hydrates the store, runs `useProtectedRoute()` to redirect between `(auth)` and `(tabs)` |
| [carApp/app/(auth)/_layout.tsx](carApp/app/(auth)/_layout.tsx) | Stack layout for unauthenticated screens |
| [carApp/app/(auth)/index.tsx](carApp/app/(auth)/index.tsx) | Splash / welcome — single CTA navigating to `/(auth)/sign-in` |
| [carApp/app/(auth)/sign-in.tsx](carApp/app/(auth)/sign-in.tsx) | "Continue with Google" button — calls `signInWithGoogle()` |

### Outside the codebase

- **Google Cloud Console** — OAuth 2.0 Client IDs and consent screen
- **Supabase Dashboard** — Google provider enabled, redirect URLs allowed
- **Apple Developer / Google Play** — only matters for store builds; not for simulator/dev

---

## 3. Configuration required

### 3a. Google Cloud Console

Create a project at https://console.cloud.google.com if you don't have one.

1. **OAuth consent screen**
   - User type: External
   - App name: CarApp (or Stabl)
   - Support email: your email
   - Scopes: `email`, `profile`, `openid` are enough
   - Test users: add your own Google account while the app is in testing mode

2. **OAuth 2.0 Client IDs** — create three:

   **a) Web application** (this is what Supabase uses)
   - Authorized redirect URI:
     ```
     https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
     ```
   - Save the **Client ID** and **Client Secret** — you'll paste them into Supabase.

   **b) iOS**
   - Bundle ID: `com.emre.carapp`
   - No client secret on iOS clients.

   **c) Android**
   - Package name: `com.emre.carapp`
   - SHA-1 certificate fingerprint: from your debug or upload keystore
     - Debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`

### 3b. Supabase Dashboard

`Authentication → Providers → Google`:

- **Enabled**: on
- **Client ID (for OAuth)**: paste the Web Client ID from step 2a
- **Client Secret (for OAuth)**: paste the Web Client Secret from step 2a
- Save

`Authentication → URL Configuration`:

- **Site URL**: `carapp://`
- **Redirect URLs (allow-list)** — add all of:
  - `carapp://` (standalone build)
  - `carapp://**` (wildcard catch-all)
  - `exp+carapp://expo-development-client/**` (dev build on simulator / device — what `AuthSession.makeRedirectUri()` returns in dev)
  - `https://auth.expo.io/@<your-expo-username>/carapp` (only if using Expo Go, which we are not)

### 3c. Local environment variables

`carApp/.env.local` (not committed) must contain:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<anon-key-from-supabase-dashboard>
```

The values come from Supabase Dashboard → Project Settings → API. **Never use the `service_role` key in the app** — it bypasses RLS.

---

## 4. Why these matter (mental model)

- `scheme: "carapp"` in `app.json` is what makes URLs like `carapp://...` open the app. Without it, the post-auth redirect can't get back into the app.
- `AuthSession.makeRedirectUri()` returns the appropriate URI for the current build:
  - In a development build → `exp+carapp://expo-development-client/`
  - In a standalone build → `carapp://`
  This value is passed as `redirectTo` to Supabase **and** Supabase must have it in the allow-list — that's the round-trip.
- Supabase uses **its own** redirect (`https://<ref>.supabase.co/auth/v1/callback`) for the Google side — that's why Google sees the Supabase URL, not the app URL. Supabase then redirects the browser back to the app URL (`carapp://...`) with tokens in the fragment.
- The Web OAuth Client ID is what Supabase exchanges with Google — the iOS/Android Client IDs are not used by our current Supabase-mediated flow, but you create them so future native SDKs work without rework.

---

## 5. Debugging checklist

Run through these top-down when sign-in fails.

### Confirm config

- [ ] `carApp/app.json` has `"scheme": "carapp"`
- [ ] `carApp/.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` set
- [ ] App was rebuilt after env changes (`.env.local` is read at build time for `EXPO_PUBLIC_` vars)
- [ ] Supabase → Authentication → Providers → Google → **Enabled**, with the Web Client ID/Secret
- [ ] Supabase → Authentication → URL Configuration has `carapp://**` and `exp+carapp://expo-development-client/**` in the redirect allow-list
- [ ] Google Cloud Console → OAuth consent screen is in "Testing" with your account added as a test user (or "In production")
- [ ] Google Cloud Console → Credentials → Web Client ID has `https://<ref>.supabase.co/auth/v1/callback` in its **Authorized redirect URIs**

### Confirm runtime

- [ ] Tap "Continue with Google" — does the in-app browser open at all? If not, the OAuth URL request failed; check console for `oauthError`.
- [ ] Does the Google account picker render? If not, the consent screen probably isn't published / your account isn't a test user.
- [ ] After picking an account, does the browser close and return to the app? If it stays open showing a JSON blob or error page, Supabase rejected the callback — check Supabase Auth logs (Dashboard → Logs → Auth) and confirm the redirect allow-list.
- [ ] After returning, does `onAuthStateChange` fire? Add a temporary `console.log` in `app/_layout.tsx` to verify.

### Common errors

| Symptom | Likely cause |
|---|---|
| `Auth session cancelled` | User backed out of the browser, or the redirect URI didn't match — Supabase will silently refuse. |
| `Missing tokens in callback URL` | Supabase redirected back, but didn't include `access_token` / `refresh_token` in the fragment. Re-check redirect URI in Supabase. |
| Browser opens, Google says "Access blocked: This app's request is invalid" | Wrong redirect URI in Google's Web Client config. Must be the Supabase callback URL, not the app's `carapp://` URL. |
| `redirect_uri_mismatch` from Google | Same as above. |
| App returns from browser but user stays on sign-in | `onAuthStateChange` didn't fire OR the users row fetch in `_layout.tsx` failed. Check Sentry / console. |
| New Google user signs in but lands on sign-in again | No `public.users` row exists yet — onboarding flow needs to insert one. This is a code-side issue, not config. |

### Inspecting in dev

- `WebBrowser.openAuthSessionAsync` logs nothing useful on its own. Wrap `signInWithGoogle()` in console logs around each `await` to see which step fails.
- The full callback URL is in `result.url` after `openAuthSessionAsync` returns — log it. The fragment after `#` should contain `access_token` and `refresh_token`.
- Supabase Auth logs (Dashboard → Logs → Auth) show every OAuth round-trip attempt with the exact failure reason.

---

## 6. What is NOT in scope here

- **Apple Sign-In** — same plumbing, different provider name. Once Google works, the Apple flow is wired identically.
- **OTP (email / phone)** — a separate path through `signInWithOtp` / `verifyOtp`, not OAuth. Phone OTP additionally requires Twilio configured at the Supabase project level.
- **New-user onboarding** — once `onAuthStateChange` returns a session but `users.id` is null, the app falls back to signup screens. That logic lives in `app/_layout.tsx`'s `useProtectedRoute` and the customer signup flow under `(auth)`.
- **Push notifications, deep links from notifications, FCM** — covered separately; not auth-blocking.
