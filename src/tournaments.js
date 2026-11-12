import { randomInt, randomUUID } from 'node:crypto';
import { createBattle, stepBattle } from './battle.js';
import { hideAwakening } from './awakening.js';

export class TournamentError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const publicState = (row, includeLogs = true) => row && ({ id: row.id, creatorId: row.creator_id, name: row.name, size: row.size,
  status: row.status, createdAt: row.created_at, ...row.state,
  matches: includeLogs ? row.state.matches : row.state.matches.map(({log,...match}) => match),
  entries: row.state.entries.map(entry => ({ ...entry, fighter: {
    ...entry.fighter, definition: hideAwakening(entry.fighter.definition, false) } })) });
function play(a, b, round, slot) {
  const first = { id: a.userId, username: a.username };
  const second = { id: b.userId, username: b.username };
  const battle = createBattle(first, a.fighter, second, b.fighter);
  while (!battle.ended) stepBattle(battle);
  return { id: randomUUID(), round, slot, a: a.userId, b: b.userId, winnerId: battle.winnerId,
    aName: a.fighter.name, bName: b.fighter.name, log: battle.log };
}
export class TournamentManager {
  constructor(store) { this.store = store; this.pool = store.pool || null; this.memory = store.tournaments ||= new Map(); this.locks = store.tournamentLocks ||= new Map(); }
  async create(user, name, size) {
    if (![8,16,32].includes(size) || typeof name !== 'string' || !name.trim() || name.length > 60 || /[<>\u0000-\u001f]/.test(name)) throw new TournamentError('大会名と人数を確認してください。', 400);
    const row = { id: randomUUID(), creator_id: user.id, name: name.trim(), size, status: 'open',
      state: { entries: [], matches: [], championId: null, round: 0 }, created_at: new Date().toISOString() };
    if (this.pool) await this.pool.query('INSERT INTO tournaments (id,creator_id,name,size,status,state) VALUES ($1,$2,$3,$4,$5,$6)',
      [row.id,row.creator_id,row.name,row.size,row.status,JSON.stringify(row.state)]);
    else this.memory.set(row.id, row);
    return publicState(row);
  }
  async list() {
    const rows = this.pool ? (await this.pool.query('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 50')).rows : [...this.memory.values()].reverse().slice(0,50);
    return rows.map(row => publicState(row,false));
  }
  async get(id) {
    const row = this.pool ? (await this.pool.query('SELECT * FROM tournaments WHERE id=$1',[id])).rows[0] : this.memory.get(id);
    return publicState(row);
  }
  async mutate(id, callback) {
    if (!this.pool) {
      const previous = this.locks.get(id) || Promise.resolve();
      let release; const next = new Promise(resolve => { release = resolve; });
      this.locks.set(id, previous.then(() => next)); await previous;
      try { const row = this.memory.get(id); if (!row) throw new TournamentError('大会が見つかりません。',404);
        const result = await callback(row, null); return result || publicState(row); }
      finally { release(); }
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT * FROM tournaments WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!row) throw new TournamentError('大会が見つかりません。',404);
      const result = await callback(row, client);
      await client.query('UPDATE tournaments SET status=$2,state=$3,updated_at=NOW() WHERE id=$1',
        [id,row.status,JSON.stringify(row.state)]);
      await client.query('COMMIT'); return result || publicState(row);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async join(id, user, fighterId) {
    return this.mutate(id, async (row, client) => {
      if (row.status !== 'open') throw new TournamentError('参加受付は終了しています。');
      if (row.state.entries.some(e => e.userId === user.id)) throw new TournamentError('同じアカウントから2体は参加できません。');
      if (row.state.entries.length >= row.size) throw new TournamentError('大会は満員です。');
      const fighter = client ? (await client.query('SELECT * FROM fighters WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[fighterId,user.id])).rows[0] : await this.store.getFighter(fighterId);
      if (!fighter || fighter.owner_id !== user.id) throw new TournamentError('所持中のAAを選んでください。',403);
      row.state.entries.push({ userId: user.id, username: user.username, fighterId, fighter: {
        id: fighter.id, name: fighter.name, art: fighter.art, definition: fighter.definition } });
    });
  }
  async start(id, userId) { return this.mutate(id, async (row, client) => {
    if (row.creator_id !== userId) throw new TournamentError('主催者だけが大会を開始できます。', 403);
    if (row.status !== 'open') throw new TournamentError('この大会は開始できません。');
    if (row.state.entries.length < 2) throw new TournamentError('2人以上の参加者が必要です。');
    for (const entry of row.state.entries) {
      const current = client ? (await client.query('SELECT * FROM fighters WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[entry.fighterId,entry.userId])).rows[0] : await this.store.getFighter(entry.fighterId);
      if (!current || current.owner_id !== entry.userId) throw new TournamentError('参加AAの所有者が変更されています。該当者は参加を取り消してください。');
      entry.fighter = { id: current.id, name: current.name, art: current.art, definition: current.definition };
    }
    const contenders = row.state.entries.map(entry => entry.userId);
    for (let i = contenders.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [contenders[i], contenders[j]] = [contenders[j], contenders[i]];
    }
    row.state.contenders = contenders;
    row.status = 'running';
  }); }
  async withdraw(id, userId) { return this.mutate(id, row => {
    if (row.status !== 'open') throw new TournamentError('開始後は取り消せません。');
    const old = row.state.entries.length; row.state.entries = row.state.entries.filter(e => e.userId !== userId);
    if (old === row.state.entries.length) throw new TournamentError('参加していません。',404);
  }); }
  async cancel(id, userId) { return this.mutate(id, row => {
    if (row.creator_id !== userId) throw new TournamentError('主催者だけが中止できます。',403);
    if (row.status !== 'open') throw new TournamentError('開始後は中止できません。');
    row.status = 'cancelled';
  }); }
  async advance(id) { return this.mutate(id, async (row, client) => {
    if (row.status !== 'running') return publicState(row);
    const { entries, matches, round } = row.state;
    const survivorIds = row.state.contenders || (round === 0 ? entries.map(e => e.userId) : entries.filter(e => matches.some(m => m.round === round && m.winnerId === e.userId)).map(e => e.userId));
    const survivors = survivorIds.map(id => entries.find(entry => entry.userId === id));
    if (survivors.length < 2 || survivors.some(entry => !entry)) throw new TournamentError('大会の対戦表が不正です。');
    const nextRound = round + 1;
    const nextContenders = [];
    for (let slot = 0; slot < Math.ceil(survivors.length / 2); slot++) {
      const first = survivors[slot * 2];
      const second = survivors[slot * 2 + 1];
      let match = matches.find(m => m.round === nextRound && m.slot === slot);
      if (!match) {
        match = second ? play(first, second, nextRound, slot) : {
          id: randomUUID(), round: nextRound, slot, a: first.userId, b: null,
          winnerId: first.userId, aName: first.fighter.name, bName: '不戦勝', log: []
        };
        matches.push(match);
      }
      nextContenders.push(match.winnerId);
    }
    row.state.round = nextRound;
    row.state.contenders = nextContenders;
    if (nextContenders.length === 1) {
      row.state.championId = nextContenders[0];
      row.status = 'complete';
      if (client) await client.query('INSERT INTO tournament_rewards (tournament_id,user_id,reward) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [row.id,row.state.championId,'champion']);
    }
  }); }
  async resume(id) {
    let state = await this.get(id);
    while (state?.status === 'running') state = await this.advance(id);
    return state;
  }
}
