# CarApp — MVP User-Flow Wireframe (Idealized Target)

> **Design spec to build against.** This describes the *ideal* MVP UX for the
> Phase 1a launch (detailers, NoVA), not strictly what exists in code today.
> Nodes marked **🎯** are idealizations that go slightly beyond the current
> build — call them out in review if out of scope.
>
> Scope grounded in `CarApp_PRD_CoreVision_v5.docx` + [end_user_flows.md](end_user_flows.md).
> Diagrams render in GitHub / VS Code Markdown preview (Mermaid).
>
> **Shapes:** `[ Screen ]` · `{ Decision }` · `([ Modal/Sheet ])` · `[[ External service ]]`

---

## 0 · Shared Entry — Account creation & role choice

```mermaid
flowchart TD
    Splash["Splash · Get Started"] --> SignIn["Sign In<br/>Email/Phone OTP · Google · Apple"]

    SignIn -->|OTP| OtpEntry["OTP Entry"]
    OtpEntry --> OtpVerify["OTP Verify · 6-digit"]
    SignIn -->|Google / Apple| OAuth[["OAuth web sheet"]]

    OtpVerify --> Session{{"Supabase session"}}
    OAuth --> Session

    Session --> HasRow{"`users` row exists?"}
    HasRow -->|Yes| Returning(["Returning user → see §3 routing"])
    HasRow -->|No| Profile["1 · Profile<br/>full name + photo"]

    Profile --> Role["2 · Role selector<br/>Customer · Provider · Both<br/>(defaults to Customer)"]
    Role --> RoleBranch{Role?}

    RoleBranch -->|Customer / Both| Vehicle["3 · Add vehicle<br/>year · make · model · trim"]
    Vehicle --> Perms["🎯 Permission priming<br/>location + notifications"]
    Perms --> ReviewC["4 · Review & confirm"]
    ReviewC --> WriteC[["write users + vehicles rows"]]
    WriteC --> CustApp(["▶ §1 Customer app · Search tab"])

    RoleBranch -->|Provider only| ReviewP["Review & confirm<br/>(vehicle step skipped)"]
    ReviewP --> WriteP[["write users row (no vehicle)"]]
    WriteP --> Vetting(["▶ §2 Provider vetting"])
```

---

## 1 · Customer — Discover → Book → Track → Rate

```mermaid
flowchart TD
    subgraph Tabs["5 tabs (same for all roles) + persistent Lug AI bubble"]
        Search["Search<br/>LocationSearchBar + category"]
        Services["Services catalog"]
        Bookings["Bookings · upcoming / past"]
        Inbox["Inbox · threads"]
        More["More · hub"]
    end

    Search --> Results["Results · ProviderCard list<br/>([ Filters sheet ])"]
    Results --> Profile["Provider Profile<br/>bio · gear score · packages"]
    Profile --> Book1["Book · 1 Services<br/>multi-select packages"]
    Book1 --> Book2["Book · 2 Details<br/>vehicle · address · date/time"]
    Book2 --> Book3["Book · 3 Review<br/>PriceBreakdown + DepositSummary"]
    Book3 --> Pay(["Stripe Payment Sheet · 15% deposit"])
    Pay --> Paid[["payment_intent.succeeded"]]
    Paid --> Confirmed{{"booking → confirmed"}}
    Confirmed --> Bookings

    Bookings --> Detail["Booking Detail<br/>status timeline + actions"]
    Detail -->|Message| Thread["Inbox thread<br/>(content-moderated)"]
    Detail -->|Track| Track["Track Live<br/>LiveMap · ETA · status bar"]
    Track -. polls provider GPS .-> ProviderGPS(["§2 provider GPS stream"])
    Detail -->|Cancel / Reschedule| Cancel(["Cancel/Reschedule sheet<br/>within 24h → 15% forfeit"])

    Confirmed -. status = completed .-> Photos["Before/After Photos gallery"]
    Photos -->|🎯 'Photos ready' push| Detail
    Photos --> Rate(["Rate sheet<br/>gear ×4 · kudos · review ≤500"])
    Rate --> Dispute(["within 48h → Dispute / Report"])

    Bookings -->|past tab| Rebook["🎯 Re-book / favorites"]
    Rebook --> Profile

    More --> Account["Account · name · avatar · vehicles"]
    More --> Settings["Settings · notif prefs"]
    More --> BecomeProvider(["Become a Provider → §2"])
    More --> Lug["Ask Lug AI"]
```

---

## 2 · Provider — Vet → Approve → Work jobs → Get paid

```mermaid
flowchart TD
    Intro["Provider Intro<br/>fees · founding program"] --> Type{"Pick type<br/>Detailer · Mechanic"}
    Type --> CreateProfile[["create provider_profile · role → both"]]
    CreateProfile --> Hub["Vetting Hub · 6 steps, all required"]

    Hub --> Identity["1 · Identity"] --> Persona[["Persona ID + selfie"]]
    Hub --> Background["2 · Background"] --> Checkr[["Checkr"]]
    Hub --> Insurance["3 · Insurance upload"]
    Hub --> Credentials["4 · Credentials · IDA/ASE"]
    Hub --> Bank["5 · Bank"] --> Connect[["Stripe Connect onboarding"]]
    Hub --> ProfileStep["6 · Profile<br/>bio · coverage · hours · menu (≥80%)"]

    Persona --> AllPass{All 6 passed?}
    Checkr --> AllPass
    Insurance --> AllPass
    Credentials --> AllPass
    Connect --> AllPass
    ProfileStep --> AllPass

    AllPass -->|No| Pending["Pending Approval<br/>per-step status"]
    Pending -.->|resume| Hub
    AllPass -->|Yes, admin approves| Approved{{"verification_status = approved"}}
    Approved --> Dashboard["Provider Dashboard<br/>My Jobs · Services & Availability · Earnings"]

    Dashboard --> MyJobs["My Jobs<br/>(auto-confirmed by deposit)"]
    MyJobs --> ActiveJob["Active Job screen"]
    ActiveJob --> EnRoute["en_route<br/>stream GPS every 5s"]
    EnRoute --> GPS[["update-provider-location Edge Fn"]]
    GPS -. feeds .-> CustTrack(["§1 customer Track screen"])
    EnRoute --> InProgress["in_progress<br/>capture before/after photos (≥4)"]
    InProgress --> Complete["Complete Job (≥4 photos)"]
    Complete --> Capture[["Stripe captures remaining 85%"]]
    Capture --> Done{{"booking → completed · payout queued"}}
    Done --> Earnings["Earnings & Payouts<br/>paid + pending · payout list · kudos"]
    Earnings -->|push| KudosPush(["payout paid / kudos received notifications"])
```

---

## 3 · Returning user / cold-start routing

```mermaid
flowchart TD
    Start["App cold start"] --> GetSession{{"getSession"}}
    GetSession --> HasUser{"`users` row?"}
    HasUser -->|No| Onb(["§0 Onboarding"])
    HasUser -->|Yes| ProviderGate{"provider-only<br/>& NOT approved?"}
    ProviderGate -->|Yes| Pending["Pending Approval<br/>(resume vetting)"]
    ProviderGate -->|No| SearchTab["Search tab<br/>(Both users keep customer access)"]
```

---

## Decisions baked in — confirm during review

| # | Decision | Why |
|---|---|---|
| 1 | **One account, opt-in provider mode** | Single role fork at onboarding + "Become a Provider" later. `Both` users keep customer access while vetting. |
| 2 | **No provider accept/decline** | 15% deposit auto-confirms the booking; provider only drives the lifecycle forward. |
| 3 | **Identical 5 tabs for every role** | Provider tooling lives under the More tab, not separate tabs. |
| 4 | **MVP = Phase 1a (detailers, NoVA)** | Mechanics, recurring subscriptions, promo codes, and the admin web console are post-MVP. |
| 5 | **Lug AI persistent everywhere** | Floating bubble with a "Talk to a person" escalation into the inbox. |

### 🎯 Idealizations beyond today's build (flag if out of MVP scope)
- **Permission priming** for location + notifications during onboarding (today: requested ad-hoc).
- **"Photos ready" push** to the customer (today: deferred).
- **Re-book / favorites** entry from past bookings (today: "Book Again" pill only).
