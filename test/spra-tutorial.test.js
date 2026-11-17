import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

const staticRoot=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
test('First launch is playable fullscreen tutorial; complete all steps and enter city', {timeout:45000},async()=>{
 const server=createServer(async(req,res)=>{
  const raw=req.url.split('?')[0],rel=raw==='/spra'||raw==='/spra/'?'spra/index.html':raw.replace(/^\//,'');
  const filename=resolve(staticRoot,rel);
  if(!filename.startsWith(staticRoot)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',types[extname(filename)]||'application/octet-stream');
   res.end(await readFile(filename));}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/spra/',{waitUntil:'load'});
  assert.equal(await page.locator('#tutorialSection').isVisible(),true);
  assert.equal(await page.locator('#citySection').isVisible(),false);
  assert.equal(await page.locator('.intro').count(),0);
  assert.equal(await page.locator('.howto').count(),0);
  assert.equal(await page.locator('footer').count(),0);
  const frame=await page.locator('#tutorialCanvas').boundingBox();
  assert.ok(Math.abs(frame.width-1280)<2 && Math.abs(frame.height-800)<2,'tutorial canvas occupies full viewport');
  await page.keyboard.down('d');
  await page.waitForFunction(()=>document.querySelector('#tutorialCounter')?.textContent.includes('02 / 07'),null,{timeout:5000});
  await page.keyboard.up('d');
  const target={x:frame.x+frame.width*26/48,y:frame.y+frame.height*15/30};
  await page.mouse.move(target.x,target.y);
  await page.mouse.down();
  await page.waitForFunction(()=>document.querySelector('#tutorialCounter')?.textContent.includes('03 / 07'),null,{timeout:4500});
  await page.mouse.up();
  // Sweep the training arena so paint covers previously untouched ground.
  const aimPoints=[[34,7],[37,22],[44,14],[33,26],[30,4],[41,8],[42,23]];
  for(const [x,y] of aimPoints){
   if((await page.locator('#tutorialCounter').textContent()).includes('04 / 07'))break;
   await page.mouse.move(frame.x+x/48*frame.width,frame.y+y/30*frame.height);
   await page.mouse.down();
   await page.waitForTimeout(270);
   await page.mouse.up();
  }
  await page.waitForFunction(()=>document.querySelector('#tutorialCounter')?.textContent.includes('04 / 07'),null,{timeout:5000});
  await page.keyboard.down('Shift');
  await page.waitForFunction(()=>document.querySelector('#tutorialCounter')?.textContent.includes('06 / 07'),null,{timeout:6500});
  await page.keyboard.up('Shift');
  await page.keyboard.press('q');
  await page.waitForFunction(()=>document.querySelector('#tutorialCounter')?.textContent.includes('07 / 07'),null,{timeout:3500});
  await page.click('#tutorialFinish');
  assert.equal(await page.locator('#citySection').isVisible(),true);
  assert.equal(await page.locator('#tutorialSection').isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('spra_tutorial_complete_v1')),'1');
  const cityBox=await page.locator('#cityCanvas').boundingBox();
  assert.ok(Math.abs(cityBox.width-1280)<2&&Math.abs(cityBox.height-800)<2);
  await page.click('#cityMenuToggle');
  await page.click('#replayTutorial');
  assert.equal(await page.locator('#tutorialSection').isVisible(),true);
  await page.click('#tutorialSkip');
  assert.equal(await page.locator('#citySection').isVisible(),true);
  assert.deepEqual(errors,[],'No JS errors during tutorial or city');
 }finally{
  await browser?.close();
  await new Promise(ok=>server.close(ok));
 }
});
