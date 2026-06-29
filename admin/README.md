# Stabl Admin Panel

Desktop web ops panel (Blocker #9). MVP slice: **provider vetting queue → approve/reject**.
Shares the mobile app's Supabase project (`apbubklogxgqkokbctwz`) and its generated types — that
is the "interlink" with the app: approving here flips the exact `provider_profiles` row the app reads.

- **Stack:** Vite + React + TypeScript. Anon key only — privileged writes go through the
  `admin-review-provider` Edge Function (which re-verifies `users.is_admin`).
- **Auth:** Supabase magic-link. Access gated by `is_admin` + RLS (you and your partner only).

## Setup

```bash
cd admin
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_ANON_KEY (publishable key)
npm run dev                  # http://localhost:5173
```

You must be on the `is_admin` allowlist to see data — see `Blueprint/external_setup.md` for seeding
your two accounts and for the Resend email setup the approve/reject flow needs.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Local dev server (1280px desktop) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run test:e2e` | Playwright E2E (hermetic — mocks Supabase, needs `npx playwright install` once) |

## Deploy (free)

Static SPA — deploy `dist/` to Vercel or Netlify free tier. Set `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` as build env vars and add an SPA rewrite (all routes → `/index.html`).
Record the live URL in `Blueprint/external_setup.md`.

## Out of scope (follow-ups)

KPI dashboard, disputes, Stripe refunds, ban/warn, promo codes, CSV export, force-cancel,
Suspend/Flag, Support/Finance RBAC tiers, and in-panel signed-URL preview of vetting documents
(currently open them in the Supabase dashboard — the bucket is service-role only).
