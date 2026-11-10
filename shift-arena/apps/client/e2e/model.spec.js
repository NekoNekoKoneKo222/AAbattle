import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  await page.locator('input[type=file]').last().setInputFiles({ name:'sample.animation.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({animations:{'animation.sample.attack':{animation_length:.3,bones:{body:{rotation:{0:[0,0,0],'.3':[0,20,0]}}}},'animation.sample.skill':{animation_length:.8,bones:{body:{rotation:{0:[0,0,0],'.8':[0,90,0]}}}}}})) });
  await expect(page.getByRole('status')).toContainText('攻撃とスキル');
  await page.getByLabel('編集中の動作').selectOption('skill');
  await expect(page.getByRole('heading', { name:'スキル使用モーション' })).toBeVisible();
  await expect(page.locator('.model-keyframes>div')).toHaveCount(2);
  const file=page.waitForEvent('download');
  await page.getByRole('button', { name:'統合版geometryを書き出す' }).click();
  expect((await file).suggestedFilename()).toBe('fighter.geo.json');
});

test('新キャラを全員向けの提出用データとして書き出せる', async ({ page }) => {
  await page.goto('/model');
  await page.getByLabel('名前').fill('Test Fighter');
  await page.getByLabel('性能のベース').selectOption('gald');
  const download=page.waitForEvent('download');
  await page.getByRole('button', { name:'提出用JSONを書き出す' }).click();
  const file=await download;
  expect(file.suggestedFilename()).toBe('shift-new-character-new.json');
  const pack=JSON.parse(await readFile(await file.path(),'utf8'));
  expect(pack.target).toEqual({kind:'new-character',name:'Test Fighter',baseCharacter:'gald'});
  expect(pack.previewModel.attack.bones.right_arm).toHaveLength(4);
  expect(pack.geometry['minecraft:geometry']).toHaveLength(1);
  await expect(page.getByRole('status')).toContainText('チャットに添付');
  await page.getByLabel('作るもの').selectOption('stage');
  await page.locator('input[type=file]').last().setInputFiles({name:file.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
  await expect(page.getByRole('status')).toContainText('提出用JSONを読み込みました');
  await expect(page.getByLabel('作るもの')).toHaveValue('new-character');
  await expect(page.getByLabel('名前')).toHaveValue('Test Fighter');
});

test('既存ステージのBlockbench素材を提出できる', async ({ page }) => {
  await page.goto('/model');
  await page.getByLabel('作るもの').selectOption('stage');
  await page.getByLabel('対象').selectOption('factory');
  await page.locator('input[type=file]').first().setInputFiles({name:'factory.geo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({'minecraft:geometry':[{description:{identifier:'geometry.factory'},bones:[{name:'floor',pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[120,1,80]}]}]}]}))});
  await expect(page.getByRole('status')).toContainText('ステージモデルを受け取りました');
  const download=page.waitForEvent('download');
  await page.getByRole('button', { name:'提出用JSONを書き出す' }).click();
  const pack=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(pack.target).toEqual({kind:'stage',id:'factory',name:'ネオンファクトリー'});
  expect(pack.geometry['minecraft:geometry'][0].bones[0].cubes[0].size).toEqual([120,1,80]);
});
