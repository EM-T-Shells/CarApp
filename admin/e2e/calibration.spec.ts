import { test, expect, type Page } from '@playwright/test';

// Hermetic E2E for the calibration report (Phase 4). Same approach as
// vetting.spec.ts: an admin session seeded into localStorage and every Supabase
// call intercepted, so the real React app, router and page run with no live
// project. Which rows an admin may see is proven against the database by
// carApp/supabase/migrations/__tests__/live_eta_and_calibration.test.sql.

const PROJECT_REF = 'apbubklogxgqkokbctwz';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

function seededSession() {
  const future = Math.floor(Date.now() / 1000) + 86_400;
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: future,
    refresh_token: 'test-refresh-token',
    user: {
      id: ADMIN_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@stabl.app',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

const ROW = {
  provider_id: '22222222-2222-2222-2222-222222222222',
  provider_name: 'Sam Provider',
  completed_jobs: 10,
  timed_jobs: 8,
  avg_suggested_mins: 110,
  avg_estimated_mins: 120,
  avg_actual_mins: 140,
  avg_overrun_mins: 20,
  within_estimate_jobs: 3,
  over_estimate_jobs: 4,
  under_estimate_jobs: 1,
  late_start_jobs: 2,
  avg_start_delay_mins: 6,
  quoted_jobs: 9,
  surcharged_jobs: 5,
  avg_quote_markup_pct: 12.4,
  max_quote_markup_pct: 42,
};

const STEADY = {
  ...ROW,
  provider_id: '33333333-3333-3333-3333-333333333333',
  provider_name: 'Riley Steady',
  avg_overrun_mins: 2,
  avg_quote_markup_pct: 3,
  max_quote_markup_pct: 8,
};

async function mockSupabase(page: Page, rows: unknown[]) {
  await page.route('**/rest/v1/users*', (route) => route.fulfill({ json: { is_admin: true } }));
  await page.route('**/rest/v1/provider_profiles*', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/get_duration_calibration*', (route) =>
    route.fulfill({ json: rows }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, session]) => window.localStorage.setItem(key as string, JSON.stringify(session)),
    [STORAGE_KEY, seededSession()],
  );
});

test('lists providers with the largest markup first, flagging outliers', async ({ page }) => {
  await mockSupabase(page, [STEADY, ROW]);
  await page.goto('/');
  await page.getByTestId('calibration-link').click();

  await expect(page.getByTestId('calibration-table')).toBeVisible();
  const rows = page.getByTestId('calibration-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Sam Provider');
  await expect(rows.first()).toContainText('110 min → 120 min → 140 min');
  await expect(rows.first().getByTestId('overrun-flag')).toHaveText('+20 min');
  await expect(rows.first().getByTestId('markup-flag')).toHaveText('12.4% / 42.0%');
  await expect(rows.nth(1).getByTestId('markup-flag')).toHaveCount(0);
});

test('asks for a different period when one is chosen', async ({ page }) => {
  const bodies: { p_since?: string }[] = [];
  await mockSupabase(page, [ROW]);
  await page.route('**/rest/v1/rpc/get_duration_calibration*', (route) => {
    bodies.push(route.request().postDataJSON() as { p_since?: string });
    return route.fulfill({ json: [ROW] });
  });

  // Days back each request asked for. Dev-mode StrictMode runs the mount effect
  // twice, so the 90-day request can appear more than once.
  const periods = () =>
    bodies.map((b) => Math.round((Date.now() - new Date(b.p_since ?? '').getTime()) / 86_400_000));

  await page.goto('/calibration');
  await expect(page.getByTestId('calibration-table')).toBeVisible();
  expect(periods()).toContain(90);

  await page.getByTestId('period-30').click();
  await expect.poll(periods).toContain(30);
  await expect(page.getByTestId('period-30')).toHaveAttribute('aria-pressed', 'true');
});

test('says so when there is nothing to report', async ({ page }) => {
  await mockSupabase(page, []);
  await page.goto('/calibration');
  await expect(page.getByTestId('calibration-empty')).toBeVisible();
});
