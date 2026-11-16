import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../shift-arena/apps/client/src/game/renderer.ts',import.meta.url),'utf8');
const styles=readFileSync(new URL('../shift-arena/apps/client/src/solar.css',import.meta.url),'utf8');

test('iPad Safari projectile renderer clears the framebuffer every frame',()=>{
 assert.match(renderer,/this\.renderer\.autoClear=false/);
 assert.match(renderer,/this\.renderer\.clear\(true,true,true\)/);
 assert.match(renderer,/this\.renderer\.render\(this\.scene,this\.camera\)/);
 assert.ok(renderer.indexOf('this.renderer.clear(true,true,true)')<renderer.indexOf('this.renderer.render(this.scene,this.camera)'));
});
test('iPad/iPadOS renderer disables dynamic shadow maps even at high quality',()=>{
 assert.match(renderer,/navigator\.maxTouchPoints>1/);
 assert.match(renderer,/this\.renderer\.shadowMap\.enabled=quality==='high'&&!this\.appleTouch/);
 assert.match(renderer,/this\.renderer\.shadowMap\.enabled=value==='high'&&!this\.appleTouch/);
});
test('all projectiles reuse shared opaque non-shadowing materials',()=>{
 assert.match(renderer,/private readonly projectileMaterials=/);
 assert.match(renderer,/mesh\.castShadow=false;mesh\.receiveShadow=false/);
 assert.doesNotMatch(renderer,/new THREE\.Mesh\(projectileGeo,new THREE\.MeshBasicMaterial/);
 assert.match(renderer,/this\.projectileMaterials\.blue\.dispose\(\)/);
});
test('Safari moving nameplates do not use GPU drop-shadow filters',()=>{
 assert.match(styles,/\.fighter-nameplate\{[^}]*filter:none/);
});
