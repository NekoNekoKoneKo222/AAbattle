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
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    const states=[];
    page.on('websocket', webSocket => {
      webSocket.on('framereceived', evt => {
        try {const msg=JSON.parse(evt.payload);if(msg.type==='state'&&msg.phase==='playing')states.push(msg);}
        catch {}
      });
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/spra/', {waitUntil:'load'});
    await page.click('[data-town-facility="fashion"]');
    assert.equal(await page.locator('#facilityTitle').textContent(),'ファッションショップ');
    await page.locator('.facility-item').filter({hasText:'ネオンTシャツ'}).click();
    assert.ok(Number(await page.locator('#cityCoins').textContent())<1200);
    await page.click('.facility-close');
    await page.click('[data-town-facility="room"]');
    assert.equal(await page.locator('.room-cell').count(),48);
    await page.locator('.room-cell').first().click();
    await page.click('.facility-close');
    await page.click('[data-town-facility="arcade"]');
    assert.equal(await page.locator('.arcade-cell').count(),25);
    await page.click('.facility-close');
    assert.equal(errors.length,0,'Town facilities must load without JavaScript errors');
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
