import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    forbidOnly: !!process.env.CI,
    fullyParallel: true,
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    reporter: 'list',
    retries: process.env.CI ? 1 : 0,
    testDir: './tests/e2e',
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
    webServer: {
        command: 'bun run dev --host 127.0.0.1 --port 4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        url: 'http://127.0.0.1:4173',
    },
    workers: process.env.CI ? 1 : undefined,
});
