import { test, expect } from '@playwright/test';

test('PCでソロ戦とオンラインルームを開始できる', async ({ page }) => {
  await page.goto('/sam');
  await page.getByRole('button', { name: /プレイ開始/ }).click();
  await expect(page.getByRole('heading', { name: '出撃準備' })).toBeVisible();
  await page.getByRole('button', { name: /ソロCPU戦を開始/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/shift-arena-desktop.png', fullPage: true });
  await expect(page.locator('.player-hud')).toContainText('GUEST');
  await page.getByRole('button', { name: '退出' }).click();
  await page.getByRole('button', { name: 'フレンドルーム作成' }).click();
  await expect(page.getByRole('heading', { name: '対戦ロビー' })).toBeVisible();
  await expect(page.locator('.room-code strong')).toHaveText(/^[A-F0-9]{6}$/);
  await page.getByRole('button', { name: /試合開始/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
});

test('iPad画面でAAbattleアカウントを使って対戦に参加できる', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('/sam');
  await page.getByRole('button', { name: /プレイ開始/ }).click();
  const username = `Shift${Date.now().toString().slice(-9)}`;
  await page.getByLabel('ユーザー名').fill(username);
  await page.getByLabel('パスワード').fill('safe-password-123');
  await page.getByRole('button', { name: '新規登録' }).click();
  await expect(page.locator('.account-pill')).toContainText(username);
  await page.getByRole('button', { name: 'フレンドルーム作成' }).click();
  await expect(page.getByRole('heading', { name: '対戦ロビー' })).toBeVisible();
  await expect(page.locator('.roster-row')).toContainText([username]);
  await page.getByRole('button', { name: /試合開始/ }).click();
  await expect(page.locator('.touch-pad')).toBeVisible();
  await expect(page.locator('.player-hud')).toContainText(username);
  await context.close();
});

test('別々のブラウザーが同じ試合に参加できる', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const host = await first.newPage();
  const guest = await second.newPage();
  for (const page of [host, guest]) {
    await page.goto('/sam');
    await page.getByRole('button', { name: /プレイ開始/ }).click();
  }
  await host.getByRole('button', { name: 'フレンドルーム作成' }).click();
  const code = await host.locator('.room-code strong').innerText();
  await guest.getByLabel('ルームコード').fill(code);
  await guest.getByRole('button', { name: '参加', exact: true }).click();
  await expect(host.locator('.roster-row')).toHaveCount(2);
  await expect(guest.locator('.roster-row')).toHaveCount(2);
  await host.getByRole('button', { name: /試合開始/ }).click();
  await expect(host.locator('canvas')).toBeVisible();
  await expect(guest.locator('canvas')).toBeVisible();
  await first.close();
  await second.close();
});

test('キャラロード、ロードアウト、練習場、パーティーを操作できる', async ({ page }) => {
  await page.goto('/sam');
  await page.getByRole('button', { name: /プレイ開始/ }).click();
  await page.getByLabel('ユーザー名').fill(`Shift${Date.now().toString().slice(-9)}`);
  await page.getByLabel('パスワード').fill('safe-password-123');
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.getByRole('button', { name: 'キャラロード', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'キャラロード' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'アンロック' })).toBeDisabled();
  await page.getByRole('button', { name: 'トレーニングで試す' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '練習メニュー' }).click();
  await expect(page.getByRole('button', { name: '無敵ダミー' })).toBeVisible();
  await page.getByRole('button', { name: '無敵ダミー' }).click();
  await page.getByRole('button', { name: '練習メニューを閉じる' }).click();
  await page.getByRole('button', { name: '退出' }).click();
  await page.getByRole('button', { name: 'ロードアウト', exact: true }).click();
  await page.getByRole('button', { name: /エネルギーシールド/ }).click();
  await page.getByRole('button', { name: /弾薬回収/ }).click();
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status')).toContainText('保存しました');
  await page.getByRole('button', { name: '← 戻る' }).click();
  await page.getByRole('button', { name: 'パーティー', exact: true }).click();
  await page.getByRole('button', { name: 'パーティーを作成' }).click();
  await expect(page.getByRole('heading', { name: /メンバー/ })).toContainText('1 / 3');
});

