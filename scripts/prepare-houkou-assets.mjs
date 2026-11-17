/**
 * Portable Houkou asset extraction for local, CI and Render builds.
 * Vite cleans public/sam before compiling. Place the user's exact models
 * in the client/public directory on EVERY build rather than relying on
 * GitHub Actions' one-off unzip step.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const assets=resolve(root,'shift-arena','assets');
const destination=resolve(root,'shift-arena','apps','client','public','houkou');
const permitted=new Set(['houkou.json','normal_attack.json',
  'ultimate_animation.json','slash.json','warning_line.json',
  'texture.png','bladetexture2.png']);
mkdirSync(destination,{recursive:true});

function unpack(filename,allowed){
  const data=readFileSync(join(assets,filename));
  let cursor=0;
  const seen=new Set();
  while(cursor+30<=data.length&&data.readUInt32LE(cursor)===0x04034b50){
    const flags=data.readUInt16LE(cursor+6);
    const method=data.readUInt16LE(cursor+8);
    const compressed=data.readUInt32LE(cursor+18);
    const uncompressed=data.readUInt32LE(cursor+22);
    const filenameLength=data.readUInt16LE(cursor+26);
    const extraLength=data.readUInt16LE(cursor+28);
    if(flags&8)throw Error('ZIP with data descriptor is not supported');
    const name=data.toString('utf8',cursor+30,cursor+30+filenameLength);
    const begin=cursor+30+filenameLength+extraLength,end=begin+compressed;
    if(end>data.length||!permitted.has(name)||!allowed.has(name)||seen.has(name))
      throw Error('Unexpected Houkou asset: '+name);
    if(method!==0&&method!==8)throw Error('Unexpected ZIP compression');
    const bytes=method===8?inflateRawSync(data.subarray(begin,end)):data.subarray(begin,end);
    if(bytes.length!==uncompressed||bytes.length>1000000)throw Error('Invalid Houkou asset: '+name);
    writeFileSync(join(destination,name),bytes);
    seen.add(name);
    cursor=end;
  }
  if(seen.size!==allowed.size||[...allowed].some(name=>!seen.has(name)))
    throw Error('Missing Houkou assets in '+filename);
}

unpack('houkou-source.zip',permitted);
unpack('houkou-user-model-exact.zip',new Set(['houkou.json']));
const hash=createHash('sha256').update(readFileSync(join(destination,'houkou.json'))).digest('hex');
if(hash!=='eb6998ff2e98c4ab18920a866dbc6b36a49f5006dc2dcf7dc63d36a3606c11f6')
  throw Error('Newly uploaded Houkou model checksum mismatch');
console.log('Houkou original 3D model and textures prepared; model hash verified');
