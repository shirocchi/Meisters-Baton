import { defineConfig, devices } from '@playwright/test';
const testPort = process.env.BATON_TEST_PORT ?? '5173';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: 'chromium',
    launchOptions: { args: ['--disable-gpu'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npm run dev -- --port ${testPort}`,
      url: `http://127.0.0.1:${testPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
