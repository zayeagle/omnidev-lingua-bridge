import { test, expect } from '@playwright/test';

/**
 * Placeholder E2E — full extension load needs Chromium with --load-extension.
 * Phase 4 expands; this keeps the suite green as a scaffold smoke.
 */
test('TC-E2E scaffold: fixture page renders', async ({ page }) => {
  await page.setContent('<html><body><h1>Hello Lingua Bridge</h1></body></html>');
  await expect(page.locator('h1')).toHaveText('Hello Lingua Bridge');
});
