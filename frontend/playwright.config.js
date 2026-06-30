import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", channel: "msedge" } },
    { name: "desktop", use: { browserName: "chromium", channel: "msedge", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
