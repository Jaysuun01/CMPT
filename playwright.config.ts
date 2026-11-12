import { defineConfig, devices } from "@playwright/test";

// e2e runs against production builds on separate ports so it never collides with `npm run dev`.
const API_PORT = 4100;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "npm run start -w backend",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), GEMINI_MOCK: "1" },
      reuseExistingServer: false,
    },
    {
      command: `npm run build -w frontend && npm run start -w frontend -- -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      // BACKEND_URL is read at build time for the /api rewrite, so it must be set for the build too.
      // NEXT_DIST_DIR keeps this build out of the folder a running `npm run dev` serves from.
      env: { BACKEND_URL: `http://127.0.0.1:${API_PORT}`, NEXT_DIST_DIR: ".next/e2e" },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
