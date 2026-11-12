export const TITLE_DEFINITIONS = Object.freeze([
  { id:'first_win', name:'初陣の戦士', condition:'PvPで1勝', key:'pvpWins', required:1 },
  { id:'veteran', name:'百戦錬磨', condition:'PvPで100勝', key:'pvpWins', required:100 },
  { id:'counter_king', name:'反撃の王', condition:'反撃を累計30回成功', key:'counters', required:30 },
  { id:'plague', name:'災厄の使者', condition:'状態異常を累計100回付与', key:'statuses', required:100 },
  { id:'phoenix', name:'不死鳥', condition:'不屈を発動して勝利', key:'lastStandWins', required:1 },
  { id:'awakened', name:'覚醒者', condition:'覚醒状態で10勝', key:'awakeningWins', required:10 },
  { id:'boss', name:'最強の挑戦者', condition:'PvE最終ボスに勝利', key:'bossWins', required:1 },
  { id:'champion', name:'トーナメント王者', condition:'大会で優勝', key:'tournamentWins', required:1 },
  { id:'dynasty', name:'三冠の王', condition:'大会で通算3回優勝', key:'tournamentWins', required:3 }
]);
const empty = () => ({ counters:{}, equipped_title:null, earned:[] });
export class TitleManager {
  constructor(store) { this.store=store; this.pool = store.pool || null; this.memory = store.titleProgress ||= new Map(); this.tournamentAwards = store.tournamentAwards ||= new Set(); }
  async get(userId) {
    if (!this.pool) {
      const state={ ...empty(), ...(this.memory.get(userId) || {}) };
      state.counters={...state.counters,pvpWins:Math.max(state.counters.pvpWins||0,(await this.store.getUser(userId))?.wins||0)};
      state.earned=[...new Set([...state.earned,...TITLE_DEFINITIONS.filter(t=>(state.counters[t.key]||0)>=t.required).map(t=>t.id)])];
      return { ...state, definitions:TITLE_DEFINITIONS };
    }
    const [progress, earned, legacy] = await Promise.all([
      this.pool.query('SELECT counters,equipped_title FROM user_achievement_progress WHERE user_id=$1',[userId]),
      this.pool.query('SELECT title_id FROM user_titles WHERE user_id=$1',[userId]),
      this.pool.query('SELECT wins FROM users WHERE id=$1',[userId])
    ]);
    const counters={...(progress.rows[0]?.counters||{}),pvpWins:Math.max(Number(progress.rows[0]?.counters?.pvpWins)||0,Number(legacy.rows[0]?.wins)||0)};
    return { counters, equipped_title:progress.rows[0]?.equipped_title || null,
      earned:[...new Set([...earned.rows.map(r=>r.title_id),...TITLE_DEFINITIONS.filter(t=>(counters[t.key]||0)>=t.required).map(t=>t.id)])], definitions:TITLE_DEFINITIONS };
  }
  async add(userId, delta) {
    if (!this.pool) {
      const state = this.memory.get(userId) || empty();
      for (const [key,value] of Object.entries(delta)) state.counters[key] = Math.max(0,(state.counters[key] || 0) + value);
      state.counters.pvpWins=Math.max(state.counters.pvpWins||0,(await this.store.getUser(userId))?.wins||0);
      state.earned = TITLE_DEFINITIONS.filter(t => (state.counters[t.key] || 0) >= t.required).map(t => t.id);
      this.memory.set(userId,state); return this.get(userId);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO user_achievement_progress (user_id) VALUES ($1) ON CONFLICT DO NOTHING',[userId]);
      const current = (await client.query('SELECT counters FROM user_achievement_progress WHERE user_id=$1 FOR UPDATE',[userId])).rows[0].counters;
      const counters = { ...current };
      for (const [key,value] of Object.entries(delta)) counters[key] = Math.max(0,(Number(counters[key]) || 0) + value);
      const legacy=(await client.query('SELECT wins FROM users WHERE id=$1',[userId])).rows[0];
      counters.pvpWins=Math.max(Number(counters.pvpWins)||0,Number(legacy?.wins)||0);
      await client.query('UPDATE user_achievement_progress SET counters=$2,updated_at=NOW() WHERE user_id=$1',[userId,JSON.stringify(counters)]);
      for (const title of TITLE_DEFINITIONS) if ((counters[title.key] || 0) >= title.required)
        await client.query('INSERT INTO user_titles (user_id,title_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[userId,title.id]);
      await client.query('COMMIT'); return this.get(userId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async equip(userId, titleId) {
    if (titleId !== null && !TITLE_DEFINITIONS.some(t => t.id === titleId)) throw Object.assign(new Error('称号が不正です。'), { status:400 });
    if (!this.pool) { const state = this.memory.get(userId) || empty(); if (titleId && !(await this.get(userId)).earned.includes(titleId)) throw Object.assign(new Error('未解放の称号です。'),{status:403}); state.equipped_title=titleId; this.memory.set(userId,state); return this.get(userId); }
    const client = await this.pool.connect();
    try { await client.query('BEGIN');
      await client.query('INSERT INTO user_achievement_progress (user_id) VALUES ($1) ON CONFLICT DO NOTHING',[userId]);
      if (titleId && !(await client.query('SELECT 1 FROM user_titles WHERE user_id=$1 AND title_id=$2',[userId,titleId])).rows[0]) {
        const title=TITLE_DEFINITIONS.find(t=>t.id===titleId);
        const wins=Number((await client.query('SELECT wins FROM users WHERE id=$1',[userId])).rows[0]?.wins)||0;
        if (title?.key!=='pvpWins' || wins<title.required) throw Object.assign(new Error('未解放の称号です。'),{status:403});
        await client.query('INSERT INTO user_titles (user_id,title_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[userId,titleId]);
      }
      await client.query('UPDATE user_achievement_progress SET equipped_title=$2 WHERE user_id=$1',[userId,titleId]);
      await client.query('COMMIT'); return this.get(userId);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async awardTournament(tournamentId, userId) {
    if (!this.pool) { const key=`${tournamentId}:${userId}`; if(this.tournamentAwards.has(key)) return false; this.tournamentAwards.add(key); await this.add(userId,{tournamentWins:1}); return true; }
    const client=await this.pool.connect();
    try { await client.query('BEGIN');
      const reward=(await client.query("SELECT claimed FROM tournament_rewards WHERE tournament_id=$1 AND user_id=$2 AND reward='champion' FOR UPDATE",[tournamentId,userId])).rows[0];
      if (!reward || reward.claimed) { await client.query('COMMIT'); return false; }
      await client.query('INSERT INTO user_achievement_progress (user_id) VALUES ($1) ON CONFLICT DO NOTHING',[userId]);
      const current=(await client.query('SELECT counters FROM user_achievement_progress WHERE user_id=$1 FOR UPDATE',[userId])).rows[0].counters;
      const counters={...current,tournamentWins:(Number(current.tournamentWins)||0)+1};
      await client.query('UPDATE user_achievement_progress SET counters=$2,updated_at=NOW() WHERE user_id=$1',[userId,JSON.stringify(counters)]);
      for(const title of TITLE_DEFINITIONS) if((counters[title.key]||0)>=title.required)
        await client.query('INSERT INTO user_titles (user_id,title_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[userId,title.id]);
      await client.query("UPDATE tournament_rewards SET claimed=TRUE WHERE tournament_id=$1 AND user_id=$2 AND reward='champion'",[tournamentId,userId]);
      await client.query('COMMIT'); return true;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
export function battleProgress(log, userId, winnerId) {
  const last = log.at(-1)?.fighters?.find(f => f.userId === userId);
  return { pvpWins:Number(userId === winnerId), counters:last?.counterCount || 0, statuses:last?.statusCount || 0,
    lastStandWins:Number(userId === winnerId && log.some(turn => turn.fighters?.some(f => f.userId === userId && f.lastStandUsed))),
    awakeningWins:Number(userId === winnerId && last?.awakened) };
}
