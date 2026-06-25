import { defineConfig } from '@playwright/test';

// The dev server is started with dummy Supabase env — every network call is
// intercepted in the spec (see e2e/vetting.spec.ts), so no live project or real
// keys are needed. The URL host's project ref drives the auth storage key
// (sb-apbubklogxgqkokbctwz-auth-token), which the spec seeds.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://apbubklogxgqkokbctwz.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
