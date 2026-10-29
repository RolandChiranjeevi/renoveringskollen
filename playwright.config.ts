import { defineConfig, devices } from '@playwright/test';

// E2E-testerna kör en egen API-server (port 3101) med en tom databas i e2e/.tmp
// och en egen Vite (port 5174), så att utvecklingsdata och körande servrar lämnas orörda.

const API_PORT = 3101;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Installerade Google Chrome – inga extra webbläsarnedladdningar behövs.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      grepInvert: /@mobil/,
    },
    { name: 'mobil', use: { ...devices['Pixel 7'], channel: 'chrome' }, grep: /@mobil/ },
  ],
  webServer: [
    {
      command: 'node e2e/reset-db.mjs && npm run start -w server',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_PATH: 'e2e/.tmp/e2e.db',
        UPLOADS_DIR: 'e2e/.tmp/uploads',
        BACKUP_DIR: 'e2e/.tmp/backups',
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run dev -w web -- --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
