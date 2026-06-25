import { test, expect, type Page } from '@playwright/test';

// Hermetic E2E for the vetting flow (Blocker #9, Workflow L web automation).
// We seed an admin session into localStorage and intercept every Supabase call,
// so the test drives the real React app/router/components with no live project.

const PROJECT_REF = 'apbubklogxgqkokbctwz';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const PROVIDER_ID = '22222222-2222-2222-2222-222222222222';

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

async function mockSupabase(page: Page) {
  // is_admin lookup (maybeSingle → single object).
  await page.route('**/rest/v1/users*', (route) =>
    route.fulfill({ json: { is_admin: true } }),
  );

  // provider_profiles: list (array) vs detail (object, has provider_vetting join).
  await page.route('**/rest/v1/provider_profiles*', (route) => {
    const url = route.request().url();
    if (url.includes('provider_vetting')) {
      return route.fulfill({
        json: {
          id: PROVIDER_ID,
          user_id: '33333333-3333-3333-3333-333333333333',
          bio: 'Mobile detailer, 6 yrs.',
          mile_radius: 25,
          created_at: '2026-06-20T10:00:00Z',
          verification_status: 'pending',
          users: { full_name: 'Sam Provider', email: 'sam@example.com', phone: '—', created_at: null },
          provider_vetting: [
            { identity_status: 'submitted', background_status: 'submitted', insurance_status: 'submitted', credentials_status: 'submitted', bank_status: 'approved', rejection_reason: null },
          ],
        },
      });
    }
    return route.fulfill({
      json: [
        {
          id: PROVIDER_ID,
          user_id: '33333333-3333-3333-3333-333333333333',
          bio: 'Mobile detailer, 6 yrs.',
          created_at: '2026-06-20T10:00:00Z',
          verification_status: 'pending',
          users: { full_name: 'Sam Provider', email: 'sam@example.com' },
        },
      ],
    });
  });

  // The privileged decision.
  await page.route('**/functions/v1/admin-review-provider', (route) =>
    route.fulfill({
      json: { ok: true, action: 'approve', verification_status: 'approved', email: { ok: true, id: 'em_1' } },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, session]) => window.localStorage.setItem(key as string, JSON.stringify(session)),
    [STORAGE_KEY, seededSession()],
  );
  await mockSupabase(page);
});

test('admin reviews queue and approves a provider', async ({ page }) => {
  await page.goto('/');

  // Queue shows the seeded pending provider.
  await expect(page.getByTestId('queue-table')).toBeVisible();
  await expect(page.getByTestId('queue-row')).toHaveCount(1);
  await expect(page.getByText('Sam Provider')).toBeVisible();

  // Open detail and approve.
  await page.getByTestId('queue-review-link').click();
  await expect(page.getByTestId('provider-name')).toHaveText('Sam Provider');
  await expect(page.getByTestId('provider-status')).toHaveText('pending');

  await page.getByTestId('approve-btn').click();

  // Decision applied + email reported sent.
  await expect(page.getByTestId('review-result')).toContainText('approved');
  await expect(page.getByTestId('review-result')).toContainText('email sent');
});

test('reject requires a reason', async ({ page }) => {
  await page.goto(`/providers/${PROVIDER_ID}`);
  await expect(page.getByTestId('provider-name')).toBeVisible();

  // Reject with no reason → inline error, no call made.
  await page.getByTestId('reject-btn').click();
  await expect(page.getByTestId('detail-error')).toContainText('reason is required');
});

test('non-admin sees a not-authorized screen', async ({ page }) => {
  // Override the is_admin lookup to false for this test.
  await page.route('**/rest/v1/users*', (route) => route.fulfill({ json: { is_admin: false } }));
  await page.goto('/');
  await expect(page.getByTestId('not-authorized')).toBeVisible();
});
