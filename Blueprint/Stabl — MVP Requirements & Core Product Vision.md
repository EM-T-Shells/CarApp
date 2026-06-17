STABL — MVP REQUIREMENTS & CORE PRODUCT VISION  
Phase 1a | Northern Virginia / DC Metro | April 2026 | Confidential  
\================================================================================

CORE PRODUCT VISION  
────────────────────────────────────────────────────────────────────────────────  
Stabl makes premium car care radically convenient — bringing vetted mobile  
detailers and mechanics to the customer's location, on their schedule. The MVP  
proves the marketplace works in Northern Virginia: providers earn reliably,  
customers book confidently, and every dollar moves through Stabl without  
friction.

PRIORITY LEGEND  
────────────────────────────────────────────────────────────────────────────────  
\[P0\]   Must ship — launch blocker. App cannot function without this.  
\[P1\]   Ship within MVP window. Important but not a day-one blocker.  
\[P2\]   Nice to have at launch. Include if sprint capacity allows.  
\[POST\] Deferred to Phase 2+. In the data model but off the critical path.

\================================================================================  
1\. AUTHENTICATION & ONBOARDING  
\================================================================================

\[P0\] Sprint 1 — Email \+ social sign-up / login  
     OTP-verified email/phone, Apple ID, Google OAuth. All new accounts default  
     to Customer role.  
     Owner: Backend

\[P0\] Sprint 1 — Vehicle profile creation  
     Year / make / model / color captured at onboarding. Multi-vehicle support  
     (up to 10). One primary vehicle per account.

\[P0\] Sprint 1 — Push notification permission  
     Contextual permission request at end of onboarding. FCM (Android) \+ APNS  
     (iOS) device token registration via Firebase.

\[P0\] Sprint 1 — Role switching (Customer \<\> Provider)  
     Single app, dual-role. Customer default at signup. Provider mode unlocks  
     after vetting is approved by admin.  
     

\================================================================================  
2\. PROVIDER SUPPLY — VETTING & ONBOARDING  
\================================================================================

\[P0\] Sprint 2 — Identity verification  
     Government-issued ID \+ selfie match via Stripe Identity or Persona.  
     SSN last 4 for tax compliance (1099-K).  
     Owner: Backend

\[P1\] Sprint 2 — Background check  
     Criminal record \+ motor vehicle record (MVR) via Checkr. Provider cannot  
     receive bookings until cleared. Async webhook delivery; provider status  
     updated automatically on result.  
     Owner: Backend

\[P0\] Sprint 2 — Stripe Connect onboarding  
     Provider links bank account via Stripe Connect before first payout.  
     Payout is blocked until onboarding is fully complete.  
     Owner: Backend

\[P1\] Sprint 2 — Provider profile & service menu  
     Bio, service area map, availability hours, package editor with pricing and  
     duration. Optional IDA/ASE certification upload displayed prominently.  
     Owner: Mobile-2

\================================================================================  
3\. PROVIDER DASHBOARD  
\================================================================================

\[P0\] Sprint 3 — Booking request management  
     Accept, decline, or counter-offer incoming booking requests. 2-hour manual  
     approval window before auto-cancel and deposit refund to customer.

\[P0\] Sprint 3 — Availability calendar  
     Provider sets open time blocks per week. Prevents double-booking. Drives  
     the customer-facing date/time slot picker.

\[P0\] Sprint 3 — Earnings dashboard & payout request  
     Daily / weekly / monthly earnings breakdown. Provider can request bank  
     transfer of available balance at any time (standard 2-business-day ACH).

\[P1\] Sprint 3 — Kudos & rating analytics  
     Provider sees gear score breakdown (4 dimensions), Kudos badge wall, and  
     30-day rating trend on their home dashboard.

\================================================================================  
4\. CUSTOMER SEARCH & DISCOVERY  
\================================================================================

\[P0\] Sprint 4 — Location-based provider search  
     Search by service type, radius (5–50 mi), date, minimum rating, and price.  
     Results displayed as list and map view (Google Maps SDK). Sort by rating,  
     distance, price, and availability.  
     Owner: Mobile-1

\[P0\] Sprint 4 — Provider public profile  
     Photo, gear rating (4 dimensions), Kudos wall, bio, packages, reviews,  
     coverage map. Sticky Book CTA at bottom of screen.  
     Owner: Mobile-1

\[P0\] Sprint 4 — Stabl service catalog  
     Platform-defined service categories (Detailing, Mechanical, Add-on) with  
     standard package descriptions and pricing tiers. Solves the  
     "exterior wash means different things to different providers" problem.  
     Owner: Backend

\[P1\] Sprint 4 — Save favorite providers  
     Customer can heart a provider for quick re-booking. Favorites accessible  
     from the More tab in the bottom navigation.  
     Owner: Mobile-1

\================================================================================  
5\. BOOKING & PAYMENTS  
\================================================================================

\[P0\] Sprint 5 — End-to-end booking flow  
     5-step flow: package selection → vehicle selection → date/time → service  
     location → review & pay. Booking confirmation screen with calendar invite.  
     Owner: Mobile-1

\[P0\] Sprint 5 — Stripe split payments  
     15% deposit charged at booking. Remaining balance captured on job  
     completion. 3% provider fee \+ 2% customer fee deducted automatically via  
     Stripe Connect destination charge model.  
     Owner: Backend

\[P0\] Sprint 5 — Cancellation policy enforcement  
     Customer cancels within 24h → $15 fee deducted from deposit refund.  
     Provider cancels within 24h → $25 penalty \+ re-booking assistance.  
     Enforced at API level, not just UI.  
     Owner: Backend

\[P0\] Sprint 5 — Saved payment methods  
     Customer adds, lists, and removes Stripe PaymentMethods. Charged at  
     deposit and balance capture without requiring re-entry each time.  
     Owner: Mobile-1

\[P1\] Sprint 5 — Promo code application  
     Promo and gift card codes validated and applied at order review step.  
     Supports flat ($) and percentage (%) discount types.  
     Owner: Backend

\================================================================================  
6\. LIVE TRACKING & JOB MANAGEMENT  
\================================================================================

\[P0\] Sprint 6 — Real-time GPS tracking  
     Provider location broadcast every 5 seconds during active booking.  
     Customer sees live provider pin, ETA badge, and status banner on a  
     full-screen Google Map.  
     \!\! FIGMA SCREEN MISSING — Design must build this before Sprint 6 starts \!\!  
     Owner: Mobile-1 \+ Backend

\[P0\] Sprint 6 — Job status progression  
     Provider taps to advance: En Route → Arrived → In Progress → Complete.  
     Each state transition triggers the corresponding customer push notification.  
     Owner: Mobile-2

\[P0\] Sprint 7 — Before & after photo upload  
     Minimum 4 photos required (before \+ after pairs). API returns error if  
     provider attempts to mark complete with fewer than 4 photos uploaded.  
     Photos stored in S3. Customer reviews gallery before approving job.  
     Owner: Mobile-2

\[P0\] Sprint 7 — Job completion & balance capture  
     Provider marks job complete → remaining balance charged to customer →  
     Stripe transfer to provider Connect account → payout push notification.  
     Owner: Backend

\================================================================================  
7\. IN-APP MESSAGING  
\================================================================================

\[P0\] Sprint 6 — Booking-scoped chat  
     In-app messaging between customer and provider, scoped to a specific  
     booking. Real-time delivery via WebSocket. No external contact information  
     is permitted to be shared. Policy notice shown on first message.  
     Owner: Mobile-1

\[P0\] Sprint 6 — Contact info detection & blocking  
     API scans message content for phone numbers, email addresses, and Venmo  
     handles. Blocks the send and warns the user. Repeat offenses escalate to  
     admin review queue.  
     Owner: Backend

\================================================================================  
8\. RATINGS, REVIEWS & KUDOS  
\================================================================================

\[P0\] Sprint 8 — Gear rating system  
     Customer rates on 4 dimensions post-job: Quality, Timeliness,  
     Communication, Value. Each scored 1–5 gear icons. Weighted overall score  
     displayed on provider card in search and on their profile.  
     Owner: Mobile-1

\[P0\] Sprint 8 — Kudos badge awarding  
     After rating, customer awards freeform social badges (multi-select):  
     Meticulous, Reliable, Magic Hands, Great Value, Fast Worker, Communicator,  
     Spotless, Punctual. Displayed on provider's Kudos wall.  
     Owner: Mobile-1

\[P1\] Sprint 8 — Rating dispute window  
     48-hour window after submission for either party to flag a rating for  
     admin review. Provider can post a public response to any customer review.  
     Owner: Backend

\================================================================================  
9\. LUG AI ASSISTANT  
\================================================================================

\[P0\] Sprint 8 — Lug AI chat (floating bubble)  
     Persistent gear-gold floating bubble accessible from all screens.  
     Launches full-screen chat powered by Claude API (claude-sonnet-4-6)  
     with a Stabl-constrained system prompt. Handles service recommendations,  
     booking guidance, package comparisons, and automotive Q\&A.  
     Owner: Mobile-1 \+ Backend

\[P1\] Sprint 8 — Vehicle-aware recommendations  
     Lug uses the customer's active vehicle profile (year/make/model) to  
     personalize service suggestions, maintenance reminders, and detailing  
     package recommendations.  
     Owner: Backend

\================================================================================  
10\. PROMOTIONS & REFERRALS  
\================================================================================

\[P0\] Sprint 9 — Founding Provider Program  
     0% platform fee for the first 100 verified providers for 3 months.  
     Auto-converts to 3% after period ends. Tracked at provider account level  
     via feature flag. Prominently displayed during provider onboarding.  
     Owner: Backend

\[P1\] Sprint 9 — Customer referral program  
     $10 credit for referrer \+ $10 credit for new user on first completed  
     booking. Unique code generated per user. 12-month expiry. Non-transferable.  
     Owner: Backend

\[P1\] Sprint 9 — Gift cards  
     Purchasable in $25 / $50 / $100 denominations. Redeemable at checkout  
     via promo code field. Remaining balance trackable in the app.  
     Owner: Mobile-1

\================================================================================  
11\. ADMIN PANEL  
\================================================================================

\[P0\] Sprint 9 — Provider vetting queue  
     Desktop-first web dashboard (1280px) for Stabl ops team. Review submitted  
     documents, approve or reject with reason code. Approval email triggered  
     to provider within 60 seconds of admin decision.  
     Owner: Fullstack

\[P0\] Sprint 9 — Dispute resolution tools  
     View flagged bookings, before/after photo evidence, and message thread  
     read-only. Issue full or partial refunds. Decision logged with admin name  
     and timestamp.  
     Owner: Fullstack

\[P1\] Sprint 9 — Booking & financial overview  
     All bookings searchable by status, date, provider, and customer. GMV,  
     net revenue, fees collected, and payout totals. Force-cancel any booking  
     with full or partial refund.  
     Owner: Fullstack

\================================================================================  
12\. NOTIFICATIONS  
\================================================================================

\[P0\] Sprints 6–8 — Full booking lifecycle push notifications  
     10 trigger events: booking confirmed, provider en route, provider arrived,  
     in progress, photos uploaded, job complete, rate now, payout sent,  
     Kudos received, 24-hour booking reminder.  
     Owner: Backend

\[P1\] Sprint 9 — Notification preferences  
     Per-event opt-in / opt-out for push, email, and SMS. Master pause toggle.  
     Critical events (booking confirmed, provider en route) cannot be fully  
     disabled.  
     Owner: Mobile-1

\================================================================================  
DEFERRED — PHASE 2+  
\================================================================================

\[POST\] Mechanics & light mechanical services (Phase 1b)  
       Separate credential requirements (ASE certs, higher liability thresholds).  
       Defer until detailing marketplace model is proven.

\[POST\] Recurring subscription bookings (Phase 2\)  
       Weekly/bi-weekly/monthly repeating appointments. 5–10% loyalty discount.  
       Data model is ready from MVP — feature deferred to avoid provider complexity at launch.

\[POST\] Provider subscription tiers — Basic / Pro / Elite (Phase 2\)  
       Paid provider tiers with advanced analytics, priority placement, CRM tools.  
       Deferred to protect supply-side economics at launch.

\[POST\] Stabl Care customer membership (Phase 2\)  
       Monthly customer subscription for discounted bookings. Revenue  
       diversification after the marketplace is proven.

\[POST\] Geographic expansion beyond Northern Virginia (Phase 2\)  
       Richmond VA → Baltimore MD → Philadelphia PA. Own NoVA deeply first.

\[POST\] Stabl Supply — product tracking (Future)  
       Provider logs products used per job. Future supplier partnerships and  
       product-to-outcome correlation layer.

\[POST\] Stabl Protection Plan (Future)  
       Per-booking contingent liability fee. Requires insurance infrastructure.

\[POST\] Instant provider availability (Phase 2\)  
       Manual 2-hour approval window is by design at launch. Instant availability  
       unlocked after early providers establish booking discipline.

\================================================================================  
SUPPLY-FIRST RULES — NON-NEGOTIABLE  
\================================================================================

1\. If a feature adds friction for providers at launch, it is deferred. The  
   Founding Provider Program, zero-fee onboarding, and white-glove setup are  
   the highest-priority GTM activities.

2\. Stripe is sacred. Deposit capture, balance capture, payout logic, and  
   refund handling are fully tested in staging before any live booking  
   goes through the system.

3\. Photo minimum is enforced at API level, not just UI. A job without photos  
   is a trust failure — it cannot be marked complete regardless of UI state.

4\. No external contact sharing. This is detected and blocked from Sprint 6  
   onward — not as a post-launch patch.

\================================================================================  
Stabl Inc. — Confidential & Proprietary — MVP Requirements v1.0 — April 2026  
\================================================================================  
P0\] Sprint 2 — Insurance verification  
     Certificate of general liability ($500K minimum) \+ auto insurance on  
     service vehicle. Manual admin review before final approval.  
     Owner: Admin / Fullstack