import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
import { createSpra } from '../src/spra.js';

const staticRoot = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2':'font/woff2' };

test('SPRA browser: player and CPU continue updating after sustained ink fire', { timeout: 45000 }, async () => {
  const game = createSpra();
  const server = createServer(async (req, res) => {
    const requestPath = req.url.split('?')[0];
    const rel = requestPath === '/spra' || requestPath === '/spra/' ? 'spra/index.html' :
      requestPath.replace(/^\//, '');
    const file = resolve(staticRoot, rel);
    if (!file.startsWith(staticRoot)) { res.writeHead(403); res.end(); return; }
    try {
      const buf = await readFile(file);
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.end(buf);
    } catch { res.writeHead(404); res.end('404'); }
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/spra/ws') game.upgrade(req, socket, head);
    else socket.destroy();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: {width:1280,height:860} });
    const errors=[],renderErrors=[];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console',e=>{
      if(e.type()==='error' && /SPRA (render|battle renderer|ink renderer)/.test(e.text()))
        renderErrors.push(e.text());
    });
    const states=[];
    page.on('websocket', webSocket => {
      webSocket.on('framereceived', evt => {
        try {const msg=JSON.parse(evt.payload);if(msg.type==='state'&&msg.phase==='playing')states.push(msg);}
        catch {}
      });
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/spra/', {waitUntil:'load'});
    assert.equal(await page.locator('.intro').count(),0,'there must be no page hero above the game');
    assert.equal(await page.locator('.howto').count(),0,'there must be no below-game help section');
    await page.click('#tutorialSkip');
    await page.click('#cityMenuToggle');
    await page.click('[data-town-facility="fashion"]');
    assert.equal(await page.locator('#facilityTitle').textContent(),'ファッションショップ');
    await page.locator('.facility-item').filter({hasText:'ネオンTシャツ'}).click();
    assert.ok(Number(await page.locator('#cityCoins').textContent())<1200);
    await page.click('.facility-close');
    await page.click('#cityMenuToggle');
    await page.click('[data-town-facility="room"]');
    assert.equal(await page.locator('.room-cell').count(),48);
    await page.locator('.room-cell').first().click();
    await page.click('.facility-close');
    await page.click('#cityMenuToggle');
    await page.click('[data-town-facility="furniture"]');
    assert.equal(await page.locator('#facilityTitle').textContent(),'家具ショップ');
    assert.ok(await page.locator('.facility-item').count()>=16);
    await page.locator('.facility-item').filter({hasText:'観葉植物'}).click();
    await page.locator('.facility-action').filter({hasText:'自分の部屋'}).click();
    await page.locator('.furniture-item').filter({hasText:'観葉植物'}).click();
    await page.locator('.room-cell').nth(1).click();
    assert.ok(await page.locator('.room-cell').nth(1).textContent()==='♣',
      'Purchased furniture should be placeable in personal room');
    await page.click('.facility-close');
    assert.equal(errors.length,0,'Town facilities must load without JavaScript errors');
    await page.click('#cityMenuToggle');
    await page.click('#openMatch');
    await page.fill('#nickname','VISUAL TEST');
    await page.click('#createBtn');
    await page.waitForFunction(() => document.querySelector('#startBtn')?.disabled === false);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.querySelector('#arenaPanel')?.classList.contains('hidden'));
    await page.waitForTimeout(650);
    assert.equal(errors.length, 0, errors.join(' | '));
    const oldCount=states.length;
    const box=await page.locator('#gameCanvas').boundingBox();
    assert.ok(box?.width>100);
    await page.mouse.move(box.x+box.width*.67,box.y+box.height*.55);
    await page.mouse.down();
    await page.waitForTimeout(3500);
    await page.mouse.up();
    assert.equal(errors.length, 0, 'canvas must not throw while shooting: '+errors.join(' | '));
    assert.deepEqual(renderErrors,[],'No caught ink-effect renderer errors when shooting continuously');
    // Paint-covered arenas must still display actual avatars in a completely
    // independent transparent canvas, not merely a non-empty floor texture.
    const actorCanvasVisible=await page.evaluate(()=>{
      const canvas=document.getElementById('actorCanvas');
      const background=document.getElementById('gameCanvas');
      if(!canvas||canvas.width!==background.width||canvas.height!==background.height)return false;
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let pixels=0;
      for(let i=3;i<data.length;i+=4)if(data[i]>170)pixels++;
      return pixels>200;
    });
    assert.equal(actorCanvasVisible,true,
      'Players and CPU must remain visibly drawn on the foreground canvas during shooting');

    assert.ok(states.length-oldCount>=10, 'state updates must continue while shooting');
    const first=states[Math.max(0,oldCount-1)];
    const last=states.at(-1);
    assert.equal(last.players.length,8);
    const before=new Map(first.players.filter(p=>p.bot).map(p=>[p.id,p]));
    const moved=last.players.filter(p=>p.bot && before.has(p.id) &&
      Math.hypot(p.x-before.get(p.id).x,p.y-before.get(p.id).y)>0.45);
    assert.ok(moved.length>=3, 'CPU positions must continue advancing: '+moved.length);
    const canvasAlive=await page.evaluate(()=>{
      const el=document.getElementById('gameCanvas');
      const ctx=el.getContext('2d'),data=ctx.getImageData(0,0,el.width,el.height).data;
      let lit=0;
      for(let i=0;i<data.length;i+=4*29)if(data[i]>20||data[i+1]>30||data[i+2]>55)lit++;
      return lit>300;
    });
    assert.equal(canvasAlive,true,'battle canvas must keep drawing visible non-background content');
    assert.match(await page.locator('#myInk').textContent(),/^\d+\/300$/);
    await page.close();
  } finally {
    await browser?.close();
    game.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
