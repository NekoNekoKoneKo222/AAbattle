import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './shift-arena/apps/client/e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:31877', browserName: 'chromium', channel: 'chrome', headless: true, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] } },
  webServer: { command: 'node src/server.js', url: 'http://127.0.0.1:31877/api/health', reuseExistingServer: false, timeout: 30000, env: { NODE_ENV: 'development', PORT: '31877', DATABASE_URL: '', GEMINI_API_KEY: '', AI_PROVIDER: 'local' } },
  reporter: 'list',
});

