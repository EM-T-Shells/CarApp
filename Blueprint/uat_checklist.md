# CarApp — UAT Checklist

A check-off list of the "UAT on phone" steps extracted from [end_user_flows.md](end_user_flows.md). Use this to verify each flow on a real device. For full scope/context of any flow, refer back to `end_user_flows.md`.

---

## Section 1 — Auth & Onboarding

### Flow 1.1 — First-time user signs up (Email or Phone OTP)
- [ ] Use a fresh email (no `users` row exists yet)
- [ ] Send OTP, verify
- [ ] Confirm you land on Profile step (not back on splash)
- [ ] Complete all 4 steps
- [ ] Confirm you land on Search tab
- [ ] Re-open app — confirm you go directly to Search (session persisted)

### Flow 1.2 — First-time user signs up (Google OAuth)
- [ ] Same as Flow 1.1 but starting from the Google button.

### Flow 1.3 — First-time user signs up (Apple OAuth)
- [ ] Native Apple sheet appears, authentication completes, new user routed into onboarding (verified on iPad via `expo run:ios --device`).

### Flow 1.4 — Returning user signs in
- [ ] Sign in with an account that already exists in `users` table → confirm direct route to Search.

### Flow 1.5 — Persistent session on cold start
- [ ] Sign in, force-quit, re-open. Should land on Search without showing sign-in.

### Flow 1.6 — Sign out
- [ ] From the More tab, tap Sign out → confirm in the native alert → verify return to splash.

---

## Section 2 — Customer Core (Discover, Book, Track, Rate)

### Flow 2.1 — Browse the service catalog
- [ ] Open Services tab. Verify catalog renders grouped by category. Check loading/empty/error states by toggling network.

### Flow 2.2 — Search for providers
- [ ] Enter "Reston, VA", tap Search → confirm provider list renders. Open filters, change sort to rating, apply, verify reorder. Empty/error states.

### Flow 2.3 — View a provider profile
- [ ] Tap any provider card. Verify avatar, rating, stats, package list, sticky Book Now button. Tap Book Now → routes to booking flow.

### Flow 2.4 — Book a service (Deposit Flow) — with Stripe test mode
- [ ] Pick a provider → Book Now
- [ ] Select a package, fill in details with test card `4242 4242 4242 4242`
- [ ] Confirm deposit charges in Stripe dashboard
- [ ] Confirm booking row appears in Supabase with status `confirmed`
- [ ] Navigate to Bookings tab — booking should appear in upcoming list

### Flow 2.5 — View upcoming bookings
- [ ] Make a booking. Open Bookings tab. Verify card renders with provider name, date, vehicle, status pill, total. Pull to refresh.

### Flow 2.6 — View a booking's details
- [ ] From bookings list, tap a card → see full detail. Tap Track → opens live map. Tap Message → opens thread.

### Flow 2.7 — View past bookings
- [ ] Tap "Past" link from header → list of past bookings.

### Flow 2.8 — Track provider live during active booking
- [ ] With an active booking, tap Track → map renders → provider pin updates. (Requires the provider side to be sending GPS — Flow 5.4.)

### Flow 2.9 — Receive arrival / status push notifications
- [ ] Make a booking → confirm push appears on lock screen → tap → opens booking detail.

### Flow 2.10 — Approve before/after photos
- [ ] With a completed job that has photos, open booking detail → see gallery of before/after.

### Flow 2.11 — Rate provider post-service (gear rating + kudos + review)
- [ ] Complete a booking → tap Rate → submit gear ratings + kudos → confirm provider's profile shows updated rating.

---

## Section 3 — Customer Account & Communication

### Flow 3.1 — Manage vehicles
- [ ] Open More → Account. Add a vehicle, edit it, set a second vehicle as primary (the star moves), delete one (confirm alert). Confirm changes survive a tab switch.

### Flow 3.2 — Manage account settings & notifications
- [ ] Account → tap avatar → pick a photo → it uploads and shows. Edit name → Save → persists. More → Settings → flip toggles; force-quit + reopen → toggles persisted.

### Flow 3.3 — More tab hub
- [ ] Open More. Confirm the profile card shows your name + email/phone and routes to Account. Tap each row → Account, Settings, Booking history (past bookings), Ask Lug, and Provider (label reads "Become a Provider" as a customer, "Provider Dashboard" once you have a provider role). Tap Sign out → confirm the alert → land on splash.

### Flow 3.4 — Inbox: list message threads
- [ ] Open Inbox. With a booking that has a thread, confirm the provider's name + booking status/date render and tapping opens the conversation. Empty + pull-to-refresh states.

### Flow 3.5 — Inbox: send and receive messages in a thread
- [ ] Open a thread → history loads, header shows the provider name. Send a message → it appears and clears the input. Send something with a phone number / "Venmo me" → it posts as `[Message flagged for review]`. With a second device/session, a new message appears live.

### Flow 3.6 — Chat with Lug AI
- [ ] Tap the gold Lug bubble (any tab) → Lug view. Ask a question → reply (once the key/deploy are in place). Confirm "Talk to a person" is visible without scrolling; ask for a human twice → it turns into a solid primary button; tap it → lands in a support thread.

---

## Section 4 — Provider Onboarding & Vetting

### Flow 4.1 — Existing customer opts in to provider mode
- [ ] More → Become a Provider → pick Detailer → Start application → lands on the vetting hub showing 6 steps with statuses. Re-open More → Provider → "Continue application" returns to the hub.

### Flow 4.4 — Complete vetting: Insurance upload
- [ ] Vetting hub → Insurance → Upload insurance photo → step shows "Under review".

### Flow 4.5 — Complete vetting: Credentials (IDA / ASE)
- [ ] Vetting hub → Credentials → upload a cert photo → "Under review".

### Flow 4.7 — Complete vetting: Profile (bio, photos, hours, coverage area)
- [ ] Vetting hub → Profile. Write a bio (≥20 chars), coverage area, radius; add a service (enter $150 / 120 min → shows $150.00); pick availability days; Save → hub shows Profile = Approved (completeness ≥ 80).

### Flow 4.8 — Provider awaits approval
- [ ] Sign in as a provider-only account with `verification_status = 'pending'` → lands on pending-approval; "Continue your application" opens the vetting hub. Flip the row to `approved` in Supabase → next cold start lands on Search.

---

## Section 5 — Provider Active Use

### Flow 5.2 — Provider manages availability calendar
- [ ] More → Provider (approved) → Manage services & availability → toggle days → Save → force-quit/reopen → confirm the chosen days persist.

### Flow 5.3 — Provider edits service menu
- [ ] More → Provider (approved) → Manage services & availability → add a service ($150 / 120 min) → it appears with price; edit/delete it.

---

## Section 6 — Cross-Cutting

### Flow 6.1 — Dark mode
- [ ] Toggle system dark mode, walk through every built screen.
