import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createSpraFunnelServer } from '../src/spra-funnel-server.js';

test('Funnel browser: real SPRA assets, login, tutorial and touch layout', {timeout:45000}, async()=>{
  const server = createSpraFunnelServer({password:'Test-only-SPRA-password-2026'});
  await new Promise(resolve=>server.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1180,height:800}});
    const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{
      if(r.status()>=400 && /\/(spra|fonts)\//.test(r.url()))requests.push(r.url()+' '+r.status());
    });
    await page.goto(base+'/spra/?room=ABCDEF',{waitUntil:'load'});
    assert.equal(await page.locator('#accessForm').count(),1);
    await page.fill('#password','Test-only-SPRA-password-2026');
    await page.click('#accessForm button');
    await page.waitForURL('**/spra/?room=ABCDEF');
    await page.waitForSelector('#gameCanvas',{state:'attached'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#gameCanvas')).imageRendering),'pixelated');
    assert.equal(await page.locator('canvas#cityCanvas').count(),1);
    assert.equal(errors.length,0,'JavaScript errors: '+errors.join(';'));
    assert.equal(requests.length,0,'Missing CSS, scripts or fonts: '+requests.join(';'));
    const tablet=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    const iPadPage=await tablet.newPage();
    await iPadPage.goto(base+'/spra/',{waitUntil:'load'});
    await iPadPage.fill('#password','Test-only-SPRA-password-2026');
    await iPadPage.click('#accessForm button');
    await iPadPage.waitForSelector('#tutorialCanvas',{state:'visible'});
    const layout=await iPadPage.evaluate(()=>({
      width:document.documentElement.scrollWidth,
      viewWidth:window.innerWidth,
      canvas:document.querySelector('#tutorialCanvas').getBoundingClientRect().width
    }));
    assert.ok(layout.canvas>0,'Game canvas displayed on iPad-sized viewport');
    assert.ok(layout.width<=layout.viewWidth+2,'No horizontal overflow on tablet');
    await tablet.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});