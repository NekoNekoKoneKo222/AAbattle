import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
test('iPad sized SPRA: no double-tap zoom, no selection, two-thumb controls stay usable', {timeout:25000},async()=>{
 const server=createServer(async(req,res)=>{
  const url=req.url.split('?')[0],rel=url==='/spra'||url==='/spra/'?'spra/index.html':url.replace(/^\//,'');
  const file=resolve(root,rel);
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
   res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({
   viewport:{width:1024,height:768},deviceScaleFactor:2,isMobile:true,hasTouch:true
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/spra/',{waitUntil:'load'});
  const values=await page.evaluate(()=>{
   const game=document.querySelector('#gameCanvas');
   const style=getComputedStyle(game);
   const bodyStyle=getComputedStyle(document.body);
   const meta=document.querySelector('meta[name=viewport]')?.content||'';
   function dispatch(node,type){
    const event=new Event(type,{bubbles:true,cancelable:true});
    node.dispatchEvent(event);
    return event.defaultPrevented;
   }
   const input=document.querySelector('#nickname');
   return{
    meta,
    action:style.touchAction,
    select:bodyStyle.userSelect,
    safariSelect:bodyStyle.webkitUserSelect,
    gestureBlocked:dispatch(game,'gesturestart'),
    selectionBlocked:dispatch(game,'selectstart'),
    contextBlocked:dispatch(game,'contextmenu'),
    doubleTapBlocked:dispatch(game,'dblclick'),
    textInputSelectionAllowed:!dispatch(input,'selectstart')
   };
  });
  assert.match(values.meta,/user-scalable=no/);
  assert.match(values.meta,/maximum-scale=1/);
  assert.equal(values.action,'none');
  assert.equal(values.select,'none');
  assert.equal(values.gestureBlocked,true);
  assert.equal(values.selectionBlocked,true);
  assert.equal(values.contextBlocked,true);
  assert.equal(values.doubleTapBlocked,true);
  assert.equal(values.textInputSelectionAllowed,true);
  assert.deepEqual(errors,[]);
  // Can't emulate native iOS Safari pinch accurately in Chromium; test
  // explicit guards plus the Playwright touch-enabled page only.
  await page.click('#tutorialSkip');
  assert.equal(await page.locator('#citySection').isVisible(),true);
  await page.click('#cityMenuToggle');
  assert.equal(await page.locator('#cityMenu').isVisible(),true);
  await context.close();
 }finally{
  await browser?.close();
  await new Promise(ok=>server.close(ok));
 }
});
