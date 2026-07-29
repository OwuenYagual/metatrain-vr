import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const localBrowserCandidates = process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : [];
const localBrowserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? localBrowserCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    outputDir: 'dist/playwright-results',
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never', outputFolder: 'dist/playwright-report' }]]
        : 'list',
    timeout: 90_000,
    expect: {
        timeout: 20_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        viewport: { width: 1280, height: 720 },
        reducedMotion: 'reduce',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    executablePath: localBrowserExecutable,
                    args: [
                        '--enable-webgl',
                        '--ignore-gpu-blocklist',
                        '--use-angle=swiftshader',
                    ],
                },
            },
        },
    ],
    webServer: {
        command: 'npm run dev:frontend -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
