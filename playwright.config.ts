import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** The teacher console server, in mock mode with a throwaway data folder. */
const TEACHER_PORT = 8788;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'student',
      testIgnore: /teacher\//,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}/bedside-sim/` },
    },
    {
      name: 'teacher',
      testMatch: /teacher\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${TEACHER_PORT}/` },
    },
  ],
  webServer: [
    {
      command: `npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/bedside-sim/`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      // Serves the built teacher console (npm run build:teacher) and its API.
      command: 'node --import tsx server/index.ts',
      url: `http://localhost:${TEACHER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        GEMINI_MOCK: '1',
        PORT: String(TEACHER_PORT),
        DATA_DIR: join(tmpdir(), `bedside-e2e-${Date.now()}`),
      },
    },
  ],
});
