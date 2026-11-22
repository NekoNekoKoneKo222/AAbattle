// Create a redistribution folder containing only the SPRA 2D game.
// Run: node scripts/build-spra-standalone.mjs
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'dist','SPRA_INK_BATTLE');
const files=[
  'src/spra.js','src/spra-ink.js','src/spra-navigation.js',
  'src/spra-leaderboard.js','src/spra-funnel-server.js',
  'START_SPRA_FUNNEL.bat','STOP_SPRA_FUNNEL.bat',
  'scripts/spra-funnel.ps1'
];
const dirs=['public/spra','public/fonts'];
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const rel of files){
  await mkdir(dirname(resolve(target,rel)),{recursive:true});
  await cp(resolve(root,rel),resolve(target,rel));
}
for(const rel of dirs){
  await mkdir(dirname(resolve(target,rel)),{recursive:true});
  await cp(resolve(root,rel),resolve(target,rel),{recursive:true});
}
await cp(resolve(root,'SPRA_STANDALONE_README.md'),resolve(target,'README.md'));
await mkdir(resolve(target,'test'),{recursive:true});
await cp(resolve(root,'test/spra-standalone.test.mjs'),resolve(target,'test/standalone.test.mjs'));
const pkg={
  name:'spra-ink-battle-standalone',
  version:'1.0.0',
  private:true,
  type:'module',
  description:'SPRA 2D ink PvP standalone Tailscale Funnel edition',
  engines:{node:'>=20'},
  scripts:{start:'node src/spra-funnel-server.js',test:'node --test test/*.test.mjs'},
  dependencies:{express:'^5.1.0',ws:'^8.18.3'}
};
await writeFile(resolve(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
async function walk(dir,prefix=''){
  const out=[];
  for(const f of await readdir(dir,{withFileTypes:true})){
    const rel=join(prefix,f.name).replaceAll('\\','/');
    if(f.isSymbolicLink())throw Error('Symlink not allowed: '+rel);
    if(f.isDirectory())out.push(...await walk(join(dir,f.name),rel));
    else out.push(rel);
  }
  return out;
}
const manifest=await walk(target);
const forbidden=['src/server.js','public/sam','public/CSH','public/SHG',
  'shift-arena','glyph-infinity','src/gateway-server.js','public/draw'];
if(manifest.some(f=>forbidden.some(v=>f===v||f.startsWith(v+'/'))))
  throw Error('Other game found in standalone folder');
console.log('Standalone SPRA staged at '+target);
console.log('Files: '+manifest.length+'; no unrelated games.');
