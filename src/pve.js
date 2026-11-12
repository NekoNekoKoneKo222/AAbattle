import { createBattle, stepBattle } from './battle.js';

const effect = (type, power, chance = 100, duration = 2) => ({ type, power, chance, duration });
const skill = (name, description, cooldown, ...effects) => ({
  name, description, cooldown, kind: effects[0].type, power: effects[0].power, effects
});

const enemies = {
  easy: {
    label: 'EASY / 記号の草原', title: '迷子のスライム', description: '初めてのPvEにおすすめ。回復を使う小さな記号の生物。',
    art: '   .----.\n  ( .__. )\n   `----`',
    definition: {
      title: '迷子のスライム', archetype: 'おだやかな記号生命体', personality: 'cautious',
      stats: { hp: 105, atk: 17, def: 7, speed: 24 },
      skills: [
        skill('ぷにっと衝撃', '小さく跳ねて体当たりする', 1, effect('damage', 43)),
        skill('ぷるぷる補修', '形を整えながら回復する', 3, effect('heal', 28)),
        skill('ねばねばの泡', '相手の動きを鈍らせる', 3, effect('weaken', 24, 85, 2))
      ], passive: { name: '微小な再生', description: '自分のターンに少しだけ回復する', kind: 'regen', chance: 0.08 }
    }
  },
  normal: {
    label: 'NORMAL / 文字の塔', title: '時計仕掛けの番人', description: '攻撃と防御を使い分ける標準難易度の守護者。',
    art: '   .---.\n  [0:0] \n  /|=|\\\n   / \\',
    definition: {
      title: '時計仕掛けの番人', archetype: '古い塔の自律守護者', personality: 'opportunistic',
      stats: { hp: 165, atk: 27, def: 17, speed: 51 },
      skills: [
        skill('秒針スラッシュ', '回転する針で切り裂く', 2, effect('damage', 69)),
        skill('時刻固定装甲', '装甲を展開して防ぐ', 3, effect('shield', 55)),
        skill('歯車の連鎖', '攻撃し、相手の動きを鈍らせる', 4, effect('damage', 45), effect('weaken', 40, 75, 2))
      ], passive: { name: '反応する歯車', description: '被弾時に反撃することがある', kind: 'counter', chance: 0.12 }
    }
  },
  hard: {
    label: 'HARD / 文字化け領域', title: 'CORRUPTED BEAST', description: '毒・火傷・吸収を駆使する危険な文字化けモンスター。',
    art: '  /#-#\\\n < ERR >\n  \\_#_/\n  // \\\\',
    definition: {
      title: 'CORRUPTED BEAST', archetype: '壊れたコードの獣', personality: 'aggressive',
      stats: { hp: 220, atk: 35, def: 24, speed: 72 },
      skills: [
        skill('例外捕食', '敵のHPを奪い取る', 2, effect('drain', 68)),
        skill('DATA ROT', '腐食する記号を浴びせる', 3, effect('poison', 59, 100, 3)),
        skill('ERROR BURST', '爆発と火傷を同時に起こす', 4, effect('damage', 88), effect('burn', 51, 75, 2))
      ], passive: { name: '欠損部位の修復', description: '自分のターンに回復する', kind: 'regen', chance: 0.15 }
    }
  },
  boss: {
    label: 'BOSS / NULL CORE', title: 'THE NULL EMPEROR', description: '最難関。気絶・自己強化・強力な攻撃を使う最終ボス。',
    art: '     /\\__/\\\n    | x  x |\n  __|  --  |__\n [__ NULL __]\n    /|____|\\',
    definition: {
      title: 'THE NULL EMPEROR', archetype: '空白を支配する王', personality: 'opportunistic',
      stats: { hp: 260, atk: 42, def: 32, speed: 91 },
      skills: [
        skill('虚無の王命', '大きな打撃で相手を気絶させる', 3, effect('damage', 85), effect('stun', 44, 30, 1)),
        skill('無限に近い零', '攻撃性能を高め、バリアを張る', 4, effect('boost', 54, 100, 3), effect('shield', 68)),
        skill('NULL COLLAPSE', '文字列を破砕してHPを奪う', 4, effect('drain', 90), effect('burn', 50, 85, 2))
      ], passive: { name: '零の逆襲', description: '低HP時に攻撃威力が上がる', kind: 'berserk', chance: 0.19 }
    }
  }
};

export const PVE_DIFFICULTIES = Object.freeze(Object.keys(enemies));

export function listPveEnemies() {
  return PVE_DIFFICULTIES.map((key) => ({
    key, label: enemies[key].label, name: enemies[key].title,
    description: enemies[key].description, art: enemies[key].art,
    stats: { ...enemies[key].definition.stats },
    skills: enemies[key].definition.skills.map(({ name, description, cooldown, effects }) => ({
      name, description, cooldown,
      effects: effects.map(({ type, power, chance, duration }) => ({ type, power, chance, duration }))
    })),
    passive: {
      name: enemies[key].definition.passive.name,
      description: enemies[key].definition.passive.description
    }
  }));
}

export function runPveBattle(user, fighter, difficulty, rng = Math.random) {
  const enemy = enemies[difficulty];
  if (!enemy) throw new Error('PvE難易度が不正です。');
  const cpu = { id: `cpu:${difficulty}`, username: 'CPU' };
  const cpuFighter = {
    id: `enemy:${difficulty}`, name: enemy.title, art: enemy.art, definition: enemy.definition
  };
  const battle = createBattle(user, fighter, cpu, cpuFighter, rng);
  while (!battle.ended) stepBattle(battle);
  return {
    id: battle.id,
    difficulty,
    enemy: enemy.title,
    fighters: [{ userId: user.id, username: user.username, name: fighter.name, art: fighter.art,
      definition: fighter.definition, hp: fighter.definition.stats.hp, maxHp: fighter.definition.stats.hp, shield: 0 },
    { userId: cpu.id, username: cpu.username, name: cpuFighter.name, art: cpuFighter.art,
      definition: cpuFighter.definition, hp: cpuFighter.definition.stats.hp, maxHp: cpuFighter.definition.stats.hp, shield: 0 }],
    log: battle.log,
    turns: battle.turn,
    won: battle.winnerId === user.id,
    winnerId: battle.winnerId
  };
}
