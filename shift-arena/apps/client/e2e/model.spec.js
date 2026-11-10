import { test, expect } from '@playwright/test';

test('統合版geometryを編集して攻撃モーションと共に書き出せる', async ({ page }) => {
  await page.goto('/model');
  await expect(page.getByRole('heading', { name: 'モデル工房' })).toBeVisible();
  await expect(page.locator('.model-viewport canvas')).toBeVisible();
  await page.screenshot({ path:'test-results/model-editor.png', fullPage:true });
  await page.locator('input[type=file]').first().setInputFiles({ name:'sample.geo.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({ format_version:'1.12.0', 'minecraft:geometry':[{ description:{identifier:'geometry.sample'}, bones:[{name:'body',pivot:[0,12,0],cubes:[{origin:[-4,0,-2],size:[8,16,4],uv:[0,0]}]}]}] })) });
  await expect(page.getByRole('status')).toContainText('geometryを読み込みました');
  await page.getByRole('button', { name:'＋ ブロック' }).click();
  await expect(page.locator('.model-list').last().getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name:'現在の時刻にキーフレーム追加' }).click();
  const file=page.waitForEvent('download');
  await page.getByRole('button', { name:'統合版geometryを書き出す' }).click();
  expect((await file).suggestedFilename()).toBe('fighter.geo.json');
});

test('アカウントにモデルを保存し再読み込みできる', async ({ page }) => {
  await page.goto('/sam');
  await page.getByRole('button', { name:/プレイ開始/ }).click();
  const username=`Model${Date.now().toString().slice(-9)}`;
  await page.getByLabel('ユーザー名').fill(username);
  await page.getByLabel('パスワード').fill('safe-password-123');
  await page.getByRole('button', { name:'新規登録' }).click();
  await expect(page.locator('.account-pill')).toContainText(username);
  await page.goto('/model');
  await expect(page.getByText(`${username} で保存`)).toBeVisible();
  await page.getByLabel('名前').fill('Test Fighter');
  await page.getByRole('button', { name:'アカウントに保存して対戦で使う' }).click();
  await expect(page.getByRole('status')).toContainText('アカウントに保存しました');
  await page.reload();
  await expect(page.getByLabel('名前')).toHaveValue('Test Fighter');
  const me=await (await page.request.get('/api/me')).json();
  await page.goto('/sam');
  await page.getByRole('button', { name:/プレイ開始/ }).click();
  const modelResponse=page.waitForResponse(response=>response.url().endsWith(`/api/shift/model/${me.user.id}`));
  await page.getByRole('button', { name:/ソロCPU戦を開始/ }).click();
  expect((await modelResponse).status()).toBe(200);
  await expect(page.locator('.arena-host canvas')).toBeVisible();
});
