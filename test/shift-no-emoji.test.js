import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const clientFiles=[
  'shift-arena/apps/client/src/main.tsx',
  'shift-arena/apps/client/src/ui/solar-ui.tsx',
  'shift-arena/apps/client/src/ui/game-extras.tsx',
  'shift-arena/apps/client/src/ui/model-editor.tsx',
  'shift-arena/apps/client/src/ui/pages.tsx'
];
test('SHIFT ARENA user interface has only vector icons and no emoji glyphs',()=>{
  for(const path of clientFiles){
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\p{Extended_Pictographic}/u,path);
  }
  const icons=readFileSync(new URL('../shift-arena/apps/client/src/ui/game-icon.tsx',import.meta.url),'utf8');
  for(const name of ['sun','coins','diamond','ticket','cube','gift','home','fighter','friends','target','lock','warning']){
    assert.match(icons,new RegExp('^\\s*'+name+':','m'),name);
  }
});
