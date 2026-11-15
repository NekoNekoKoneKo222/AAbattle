export const SKIN_CATALOG=Object.freeze({
  default:{name:'標準',cost:0},
  hologram:{name:'ホログラム',cost:15},
  gold:{name:'金色フレーム',cost:25},
  rainbow:{name:'虹色',cost:40},
  glitch:{name:'グリッチ',cost:30}
});

export function equippedSkin(profile,cardId){
  const entry=profile?.skins?.[cardId];
  const skin=entry?.equipped;
  return skin&&SKIN_CATALOG[skin]&&entry.owned?.includes(skin)?skin:'default';
}
