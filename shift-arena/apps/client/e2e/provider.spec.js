import { test, expect } from '@playwright/test';

test('AAbattleの生成AIボタンがジョブごとの方式を送る', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { generationMode: 'ollama', model: 'qwen2.5:3b', availableProviders: { gemini: true, ollama: true, local: true } } }));
  await page.route('**/api/ai/status*', route => route.fulfill({ json: { provider: 'gemini', connected: true, installed: true, model: 'gemini-3.5-flash-lite', generating: false, waiting: 0, checkedAt: Date.now() } }));
  await page.route('**/api/fighters/generate', route => route.fulfill({ status: 202, json: { jobId: 'a'.repeat(64) } }));
  await page.route('**/api/fighters/jobs/*', route => route.fulfill({ status: 202, json: { status: 'running' } }));
  await page.goto('/');
  await page.locator('#switch-register').click();
  await page.locator('#username').fill(`Provider${Date.now().toString().slice(-8)}`);
  await page.locator('#password').fill('safe-password-123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#fighter-form')).toBeVisible();
  await expect(page.locator('#provider-gemini')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#fighter-name').fill('ジェミニ猫');
  const geminiRequest=page.waitForRequest(request=>request.url().endsWith('/api/fighters/generate'));
  await page.locator('#generate-button').click();
  expect((await geminiRequest).postDataJSON().provider).toBe('gemini');
  await page.locator('#provider-ollama').click();
  await expect(page.locator('#provider-ollama')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#fighter-name').fill('オラマ猫');
  const ollamaRequest=page.waitForRequest(request=>request.url().endsWith('/api/fighters/generate'));
  await page.locator('#generate-button').click();
  expect((await ollamaRequest).postDataJSON().provider).toBe('ollama');
});
