  
**STABL**

Product Workflow Documentation

Account Creation \+ Workflows A through N

Northern Virginia / DC Metro Launch

Version 1.0  ·  Confidential

# **Section 1 — Account Creation**

This section covers the end-to-end onboarding flow for both new customers and new providers. The account creation flow is the entry point into the Stabl platform and determines which home experience the user lands on.

## **ACCOUNT: Account Creation Flow**

Screens 01–07

| Actor | New User (Customer or Provider) |
| :---- | :---- |
| **Goal** | Create a verified Stabl account, confirm role, add a vehicle, and reach the home screen. |
| **Trigger** | User installs the Stabl app and taps Get Started. |
| **Outcome** | Authenticated session active; vehicle profile saved; role confirmed; user reaches appropriate home screen. |
| **Screens** | 01 Sign In · 02 Sign Up · 03 Add Vehicle · 04 Role Selection · 05 Provider Onboarding · 06 Pending Approval · 07 Home |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| 01 | Splash / Sign In | Tap Get Started or Sign In | Returning users enter credentials and skip to Home. New users continue to Sign Up. |
| 02 | Sign Up | Enter full name, email, password and tap Continue | Validation: email must be unique; password minimum 8 characters. Google or Apple SSO available. |
| 03 | Add Your Vehicle | Enter vehicle year, make, and model; tap Save Vehicle | Skippable at signup. Required before a booking can be confirmed. |
| 04 | Role Selection | Tap Customer (I need my car cleaned) or Provider (I want to offer services) | Role determines home screen, bottom nav items, and available features. |
| 04a | Customer path | Continue; system routes user to Home as Customer | No further onboarding required for customers. |
| 04b | Provider path | Continue; system routes user to Provider Onboarding | Providers must complete onboarding before accepting any bookings. |
| 05 | Provider Onboarding | Select service types, set service radius in miles, upload government-issued ID | ID upload triggers Checkr background check. MVP alternative: self-attestation plus manual review. |
| 06 | Pending Approval | View confirmation screen: We will notify you when approved | Push notification and email sent when background check clears. Job acceptance is locked until approved. |
| 07 | Home | Land on Search tab (Customer) or Dashboard tab (Provider) | Session is active. First-time customers prompted to add vehicle if skipped in step 03\. |

### **Notes & Constraints**

* Vehicle year, make, and model are stored on the user profile and pre-filled for every booking

* Should Add DOB and home address as well for data purposes

* Another checkbox too for allowing us to send extra emails and promos type shit

* Providers cannot accept jobs until background check clears (account status: pending\_approval)

* Founding Provider Program: first 100 verified providers receive 0% platform fee

* Provider role can be added later from More \> Account Settings with re-verification required

# **Section 2 — Customer Core Flows**

These workflows cover the primary customer journeys: discovering providers, managing bookings, and communicating with providers. They represent the highest-frequency interactions on the platform.

## **A: Workflow A — Search & Discovery**

3 Screens

| Actor | Authenticated Customer |
| :---- | :---- |
| **Goal** | Find a vetted mobile detailer near the customer location and view their full profile. |
| **Trigger** | Customer taps the Search tab in the bottom navigation bar. |
| **Outcome** | Customer views provider profile and taps Book Now to enter the booking flow. |
| **Screens** | A1 Search Results · A2 Filter Sheet · A3 Provider Profile |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| A1 | Search Results | Enter zip code or allow location detection; browse provider list | Sorted by proximity. Each card shows name, avatar, distance, Shines rating, and starting price. |
| A1a | Search Results | Scroll list; tap a provider card to view their profile | Unavailable providers are greyed out and show next available date. |
| A2 | Filter Sheet | Tap Filters; set service type, max distance, availability date, price range; tap Apply | Filters persist for the session. Active filter count shown on the Filters button. |
| A3 | Provider Profile | View provider bio, services, Kudos badges, and Shines reviews | Full service catalog shown with price per service. |
| A3a | Provider Profile | Tap a service; tap Book Now | Provider ID and selected service passed into the booking flow. |

### **Notes & Constraints**

* Provider card shows: name, initials avatar, distance in miles, Shines rating out of 5, starting price

* Filter options: service type, max distance 1 to 25 miles, date picker, price tier

* Providers with no availability in the next 7 days are suppressed from default results

* Book Now on the Provider Profile is the primary entry point into the core booking flow

## **B: Workflow B — Bookings Management**

3 Screens

| Actor | Authenticated Customer |
| :---- | :---- |
| **Goal** | Review booking history, view job receipts and before/after photos, and rebook a past service. |
| **Trigger** | Customer taps the Bookings tab in the bottom navigation bar. |
| **Outcome** | New booking initiated from a past job with one tap. |
| **Screens** | B1 Bookings Tab · B2 Past Booking Detail · B3 Rebook Confirmation |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| B1 | Bookings Tab | Tap Bookings; toggle between Upcoming and Past tabs | Upcoming tab is default when active bookings exist. |
| B2 | Past Booking Detail | Tap any past booking row; view full booking receipt | Shows provider, services, total paid, date, and before/after photos if uploaded. |
| B3 | Rebook Confirmation | Tap Book Again; review pre-filled details; select new date and time; tap Confirm | Same provider and service pre-selected. New date picker shown. Provider pricing changes flagged. |

### **Notes & Constraints**

* Before and after photos uploaded by provider at job completion are stored on the booking record

* Cancellation policy: full deposit refund if cancelled more than 24 hours before the appointment

* Rebooking creates a new independent booking; no special rebooking discount applied at MVP

## **C: Workflow C — Inbox & Messaging**

2 Screens

| Actor | Customer or Provider |
| :---- | :---- |
| **Goal** | Send and receive messages with the other party about a specific booking. |
| **Trigger** | User taps Inbox tab or opens a message push notification. |
| **Outcome** | Message delivered; push notification sent to recipient within 2 seconds. |
| **Screens** | C1 Inbox List · C2 Message Thread |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| C1 | Inbox List | Tap Inbox; view conversation list sorted by most recent message | Unread dot badge shown on Inbox tab icon and on individual thread rows. |
| C2 | Message Thread | Tap a conversation; read message history; type and send reply | Booking context card with date, service, and status pinned at the top of the thread. |
| C2a | Message Thread | Type message and tap Send | Push notification delivered to the recipient. Message stored server-side. |

### **Notes & Constraints**

* Each thread is scoped to one booking. No free-form chats between users outside of bookings.

* Full message history is accessible to both parties for the lifetime of the booking

* Support staff can view threads via the admin panel for dispute resolution

## **D: Workflow D — Provider Dashboard**

3 Screens

| Actor | Approved Provider |
| :---- | :---- |
| **Goal** | Monitor today's job queue, track earnings, and manage weekly schedule availability. |
| **Trigger** | Provider opens the app and lands on the Dashboard tab (default for providers). |
| **Outcome** | Provider has clear view of workload, pending actions, and cumulative earnings. |
| **Screens** | D1 Dashboard Home · D2 Earnings Detail · D3 Calendar and Schedule |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| D1 | Dashboard Home | View today's job queue, earnings snapshot, and Shines rating summary | Jobs awaiting approval shown prominently with a countdown timer for the 2-hour acceptance window. |
| D2 | Earnings Detail | Tap Earnings card; view weekly and monthly breakdown | Net earnings displayed after platform fee deduction. Pending payouts highlighted separately. |
| D3 | Calendar and Schedule | Tap Schedule; view calendar with confirmed bookings and blocked dates | Tap any date to mark as unavailable, which blocks new booking requests for that day. |

### **Notes & Constraints**

* Earnings display net of platform fee: 3% at MVP, ramping to 5% at growth milestones

* Jobs in pending\_provider\_approval status show a 2-hour countdown before auto-cancel

* Providers can set recurring unavailability such as every Sunday from the calendar view

# **Section 3 — Settings, Notifications & Booking Actions**

These workflows cover account configuration, the notification center, and the actions a customer can take on an active booking (adding services, cancelling).

## **E: Workflow E — More & Settings**

2 Screens

| Actor | Customer or Provider |
| :---- | :---- |
| **Goal** | Update profile details, manage payment methods, and configure notification preferences. |
| **Trigger** | User taps More tab in the bottom navigation bar. |
| **Outcome** | Settings saved; user returned to More menu. |
| **Screens** | E1 More Tab Menu · E2 Account Settings |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| E1 | More Tab | Tap More; browse menu items | Menu items: Profile, Payment Methods, Notifications, Help and Support, Logout. Providers also see Payout Settings. |
| E2 | Account Settings | Tap any menu row; edit inline or navigate to sub-screen | Changes auto-save on field blur or when leaving the sub-screen. |
| E2a | Payment Methods | Tap Payment Methods; add or remove credit card or bank account | Stripe tokenization used. Raw card numbers never stored on Stabl servers. |
| E2b | Notifications | Tap Notifications; toggle preferences per category | Categories: Booking Updates, Messages, Promotions, System Alerts. |

### **Notes & Constraints**

* Profile photo, display name, and service area editable from Account Settings

* Account deletion triggers a 30-day grace period before permanent data removal per Virginia CDPA

* Providers access Payout Settings to configure bank account and payout schedule (see Workflow M)

## **F: Workflow F — Notifications Center**

1 Screen

| Actor | Customer or Provider |
| :---- | :---- |
| **Goal** | Review and act on all platform notifications in a single feed. |
| **Trigger** | User taps the bell icon in the header or opens a push notification banner. |
| **Outcome** | User views notification and is deep-linked to the relevant screen. |
| **Screens** | F1 Notifications Center |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| F1 | Notifications Center | Tap bell icon; view full notification feed | Notifications grouped by category: Booking, Payment, Message, Promo. |
| F1a | Tap Notification | Tap any notification row | Deep-links to relevant screen. Example: Booking Update opens Booking Detail. |
| F1b | Mark All Read | Tap Mark All Read | Clears unread badge on bell icon. Individual swipe-to-dismiss also supported. |

### **Notes & Constraints**

* Push and in-app notifications active by default. SMS is optional and requires 10DLC registration.

* Every booking state change generates a notification for both the customer and provider

* Promotional notifications respect per-category preferences set in Workflow E

## **G: Workflow G — Booking Management Actions**

2 Screens

| Actor | Customer |
| :---- | :---- |
| **Goal** | Add a service to an upcoming booking or cancel with the appropriate refund applied. |
| **Trigger** | Customer opens an upcoming booking detail and taps Add Service or Cancel Booking. |
| **Outcome** | Service added and incremental charge captured, or booking cancelled and deposit refunded. |
| **Screens** | G1 Add Service to Booking · G2 Cancel Booking Confirmation |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| G1 | Add Service | Tap Add Service; browse the booked provider's active service catalog | Only services listed by the same provider are shown. |
| G1a | Add Service | Select service; review price; tap Add to Booking | Stripe charges the incremental amount. Booking total updated and customer emailed. |
| G2 | Cancel Booking | Tap Cancel Booking; review cancellation policy and refund amount | Policy: full refund if cancelled more than 24 hours before appointment. No refund within 24 hours. |
| G2a | Cancel Confirmation | Tap Confirm Cancellation | Booking status set to cancelled. Deposit refunded per policy. Provider notified via push and email. |

### **Notes & Constraints**

* Add Service is only available while the booking status is confirmed, not in-progress or complete

* Customer no-show forfeits the full booking amount. Provider must mark the job as No Show.

* Provider is notified of all customer-initiated booking changes within 30 seconds

## **H: Workflow H — Provider Job Flow**

2 Screens

| Actor | Approved Provider |
| :---- | :---- |
| **Goal** | Receive a booking request, accept within the 2-hour window, complete the job, upload photos, and trigger payment. |
| **Trigger** | Customer submits a booking; provider receives a push notification. |
| **Outcome** | Job marked complete; net payment released to provider; customer unlocks Kudos rating screen. |
| **Screens** | H1 New Booking Alert · H2 Provider Job Detail |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| H1 | New Booking Alert | Receive push notification; open app; view booking summary with service, date, address, and price | 2-hour accept window shown as a countdown timer on the alert screen. |
| H1a | Accept Booking | Tap Accept | Booking status moves to confirmed. Customer notified immediately via push and in-app. |
| H1b | Decline Booking | Tap Decline | Booking auto-cancelled. 15% deposit refunded to customer. Provider decline rate tracked; excessive declines flagged. Provider provides reason why declined |
| H2 | Job Detail (Day-of) | Tap job on dashboard; tap On My Way | Status update pushed to customer: Provider is on the way. |
| H2a | Complete Job | Tap Mark Complete; upload before and after photos | Photos attached to the booking record. Both parties notified of completion. |
| H2b | Payment Release | No action required by provider | Platform releases net payment to provider Stripe Connect account. Payout within 2 business days. |

### **Notes & Constraints**

* Booking approval model is Option B: manual accept or decline with a 2-hour window before auto-cancel

* Status flow: pending\_provider\_approval \> confirmed \> on\_the\_way \> in\_progress \> complete

* Provider cannot mark a job complete without uploading at least one photo

* Net payout equals booking total minus the 5% platform fee

# **Section 4 — Advanced Features, Admin & Provider Tools**

These workflows cover gift cards, referrals, subscriptions, the admin panel, provider payouts, and provider service setup. Some (K — Recurring Subscriptions) are scheduled for Phase 2\.

## **I: Workflow I — Gift Cards & Promo Codes**

4 Screens

| Actor | Customer |
| :---- | :---- |
| **Goal** | Purchase and send a gift card, or apply a promo code to reduce a booking total. |
| **Trigger** | Customer navigates to More \> Gift Cards, or taps Add Promo Code at checkout. |
| **Outcome** | Gift card delivered to recipient by email, or discount applied to booking total. |
| **Screens** | I1 Gift Cards Home · I2 Purchase Gift Card · I3 Promo Code Entry · I4 Confirmation |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| I1 | Gift Cards Home | Navigate to More \> Gift Cards; view existing card balance and purchase options | Existing card balance shown if user has received a gift card. |
| I2 | Purchase Gift Card | Select amount ($25, $50, $100, or custom); enter recipient email; tap Pay | Stripe charge processed. Recipient receives a branded email with redemption code. |
| I3 | Promo Code Entry | At checkout tap Add Promo Code; enter code; tap Apply | Code validated against promo table. Discount displayed before payment confirmation. |
| I4 | Confirmation | Review updated booking total with discount applied; tap Confirm Booking | Promo usage logged. Single-use codes invalidated immediately upon redemption. |

### **Notes & Constraints**

* Gift cards never expire in compliance with Virginia gift card law

* Promo code types: flat dollar off, percentage off, or a specific free service

* Referral credits from Workflow J are redeemed through the same promo code flow

## **J: Workflow J — Referral Program**

3 Screens

| Actor | Customer or Provider |
| :---- | :---- |
| **Goal** | Share a unique referral link and earn credit when referred users complete their first booking. |
| **Trigger** | User navigates to More \> Refer a Friend. |
| **Outcome** | Referral credit applied to the referrer account when the referred user completes a qualifying booking. |
| **Screens** | J1 Referral Home · J2 Share Sheet · J3 Referral Status |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| J1 | Referral Home | Navigate to More \> Refer a Friend; view personal referral code, total referrals sent, and total earned | Pending credits shown separately from credited earnings. |
| J2 | Share Sheet | Tap Share; native share sheet opens with a pre-populated message and unique referral link | Link is attributed per user and tracked by the platform. |
| J3 | Referral Status | Return to Referral Home to view referred user statuses | Status states: Signed Up, First Booking Pending, Credit Earned. |

### **Notes & Constraints**

* Referral reward: $10 credit per qualifying referral (amount configurable in admin)

* Qualifying event: referred user completes and pays for their first booking

* Referral credits are applied as promo codes at next checkout via Workflow I

## **K: Workflow K — Recurring Subscriptions**

4 Screens

| Actor | Customer |
| :---- | :---- |
| **Goal** | Set up a recurring service schedule with automatic rebooking and billing. |
| **Trigger** | Customer taps Set Up Recurring on a confirmed booking or from a provider profile. |
| **Outcome** | Recurring schedule created; bookings auto-generated per chosen cadence. |
| **Screens** | K1 Subscription Setup · K2 Frequency Picker · K3 Review and Confirm · K4 Subscription Dashboard |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| K1 | Subscription Setup | Tap Set Up Recurring; select service and provider | Only services the provider has marked as recurring-eligible are shown. |
| K2 | Frequency Picker | Choose cadence: Weekly, Bi-weekly, or Monthly; select preferred day and time window | Provider availability is checked against the cadence before the user can confirm. |
| K3 | Review and Confirm | Review schedule summary, cost per booking, and cancellation terms; tap Confirm | First booking created immediately. Subsequent bookings queued in the system. |
| K4 | Subscription Dashboard | View active subscriptions; pause, modify cadence, or cancel | Pausing suspends future auto-bookings without cancelling the subscription. |

### **Notes & Constraints**

* Deferred to Phase 2 if the MVP cost-reduction path is adopted

* Each recurring booking follows the standard booking and payment flow in Workflow H

* Customer can cancel a recurring schedule with 48 hours notice before the next booking

## **L: Workflow L — Admin Panel**

5 Screens

| Actor | Stabl Internal Staff |
| :---- | :---- |
| **Goal** | Manage providers, resolve disputes, configure promotions, and monitor platform health. |
| **Trigger** | Admin navigates to the Stabl admin web portal (desktop, 1280px minimum width). |
| **Outcome** | Admin action completed: provider approved, dispute resolved, promo created, or report exported. |
| **Screens** | L1 Admin Dashboard · L2 Provider Management · L3 Dispute Resolution · L4 Promo Configuration · L5 Platform Analytics |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| L1 | Admin Dashboard | Log in; view KPI overview: GMV, active providers, open disputes, and NPS | Data refreshes every 5 minutes. |
| L2 | Provider Management | Navigate to Providers; search and filter provider list; open a provider record | Actions available: Approve, Suspend, Flag for Review. Background check status visible. |
| L3 | Dispute Resolution | Navigate to Disputes; open a dispute; view booking details, message thread, and photos | Admin actions: issue full or partial refund, release payment, ban user, or send warning. |
| L4 | Promo Configuration | Navigate to Promotions; tap Create Promo Code; fill in code details | Fields: code string, type (flat, percent, or free service), value, expiry, max redemptions, user segment. |
| L5 | Platform Analytics | Navigate to Analytics; view GMV, bookings, and provider earnings over selected date range | Data exportable as CSV. Segmentable by geography or service type. |

### **Notes & Constraints**

* Admin panel built on Retool (recommended for MVP cost reduction) or a custom web application

* Role-based access: Admin (full), Support (disputes and refunds only), Finance (payouts and analytics only)

* All admin actions are audit-logged with timestamp and actor identity

## **M: Workflow M — Provider Payout & Tax**

4 Screens

| Actor | Approved Provider |
| :---- | :---- |
| **Goal** | Configure payout bank account, view payout history, and access annual tax documents. |
| **Trigger** | Provider navigates to More \> Payout Settings. |
| **Outcome** | Bank account linked; payouts initiated automatically within 2 business days of job completion. |
| **Screens** | M1 Payout Settings · M2 Bank Account Setup · M3 Payout History · M4 Tax Documents |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| M1 | Payout Settings | Navigate to More \> Payout Settings; view current linked account and payout schedule | Default schedule: standard 2-business-day payout via Stripe Connect. |
| M2 | Bank Account Setup | Tap Add Bank Account; enter routing and account number through Stripe's secure input | Stripe handles micro-deposit verification if required. Stabl never stores raw bank details. |
| M3 | Payout History | Tap Payout History; view all completed payouts with per-booking breakdown | Each row shows: gross amount, platform fee, net earned, and transfer date. |
| M4 | Tax Documents | Tap Tax Documents; download 1099-K for the applicable tax year | 1099-K generated for providers earning more than $600 per year per IRS threshold. |

### **Notes & Constraints**

* Stripe Connect architecture handles all fund routing; Stabl never holds provider funds

* Platform fee deducted at payout time: 5% at MVP, ramping to 7% at growth milestone

* Providers below the 1099-K threshold still receive an annual earnings summary for their records

## **N: Workflow N — Provider Service Setup**

6 Screens

| Actor | Approved Provider |
| :---- | :---- |
| **Goal** | Build and publish a service menu that customers see when browsing the provider profile. |
| **Trigger** | Provider navigates to Services tab or is prompted during Provider Onboarding (screen 05). |
| **Outcome** | Service menu published; services visible to customers in Search results and on Provider Profile. |
| **Screens** | N1 Service Menu Home · N2 Add Services (Catalog) · N3 Service Editor · N4 Products Used · N5 Service Preview · N6 Service Menu Live |

### **Step-by-Step Flow**

| Step | Screen | User Action | System Response / Notes |
| :---- | :---- | :---- | :---- |
| N1 | Service Menu Home | Navigate to Services tab; view current service menu (empty state or populated list) | Empty state shows a prompt to add first service. Populated state shows all active services with toggle to enable or disable each. |
| N2 | Add Services (Catalog) | Tap Add Service; browse Stabl platform service catalog | Platform-defined service types prevent naming ambiguity. Up to 3 custom services allowed per provider. |
| N3 | Service Editor | Tap a catalog service; edit description, price, and estimated duration; tap Save | Provider can customize description within platform guidelines. Price and duration are required fields. |
| N4 | Products Used | Tap Products Used on a service; add products used for that service | Products recorded per service for data tracking. Optional at MVP. |
| N5 | Service Preview | Tap Preview; view the customer-facing version of the service listing | Shows exactly what a customer sees on the provider profile. Confirm or go back to edit. |
| N6 | Service Menu Live | Tap Publish; service menu goes live on provider profile | Provider receives confirmation. Services immediately visible to customers in search. |

### **Notes & Constraints**

* Platform-defined service catalog solves naming inconsistency across providers

* Custom service slots limited to 3 per provider; subject to moderation before approval

* Custom services are not searchable platform-wide; customers discover them only on provider profiles

* Services can be toggled on or off without deleting them from the menu

