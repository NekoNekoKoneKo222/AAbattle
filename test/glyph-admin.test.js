import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { GlyphAdminStore, isGlyphAdmin } from '../src/glyph-admin.js';

test('world edits validate terrain and retain the last good version',async()=>{
  const store=new GlyphAdminStore(null,'./glyph-infinity/world.txt');
  assert.equal(isGlyphAdmin({username_key:'nekonekokoneko'}),true);
  assert.equal(isGlyphAdmin({username:'nekonekokoneko'}),false);
  await assert.rejects(()=>store.saveWorld('broken','owner',0),/world.txt/);
  assert.equal(store.version,0);
  const edited=store.source.replace('.^......+',':^......+');
  const saved=await store.saveWorld(edited,'owner',0);
  assert.equal(saved.version,1);
  await assert.rejects(()=>store.saveWorld(store.defaultSource,'owner',0),/更新/);
  assert.equal(store.source,edited);
});

test('admin endpoints require the named account and a same-origin request',{timeout:20000},async(t)=>{
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['src/server.js'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'development',PORT:String(port),DATABASE_URL:'',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let errors='';server.stderr.on('data',data=>errors+=data);
  t.after(()=>server.kill('SIGTERM'));
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/health`)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
  assert.ok(ready,errors);
  const register=async(username)=>{const r=await fetch(`${base}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'secure-password-123'})});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0];};
  const admin=await register('nekonekokoneko'),other=await register('tester123');
  const req=(route,cookie,method='GET',body,origin=base)=>fetch(`${base}${route}`,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.equal((await req('/api/GF/admin',other)).status,403);
  assert.equal((await fetch(`${base}/api/GF/chat`)).status,401);
  assert.deepEqual((await (await req('/api/GF/chat',other)).json()).messages,[]);
  assert.equal((await req('/api/GF/admin',admin)).status,200);
  assert.equal((await req('/api/GF/admin/notice',admin,'POST',{message:'hello'},'https://evil.example')).status,403);
  assert.equal((await req('/api/GF/admin/notice',other,'POST',{message:'hello'})).status,403);
  assert.equal((await req('/api/GF/admin/notice',admin,'POST',{message:'hello'})).status,201);
  assert.equal((await (await fetch(`${base}/api/GF/announcements`)).json()).notices[0].message,'hello');
  const before=await (await fetch(`${base}/GF/world.txt`)).text();
  assert.equal((await req('/api/GF/admin/world',admin,'PUT',{source:'bad',version:0})).status,400);
  assert.equal(await (await fetch(`${base}/GF/world.txt`)).text(),before);
  assert.equal((await req('/api/GF/admin/world',admin,'PUT',{source:before,version:0})).status,200);
});
