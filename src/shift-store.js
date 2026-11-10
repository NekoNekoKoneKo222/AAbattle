import { randomUUID } from 'node:crypto';
import { characterRoad, loadoutOptions, masteryLevel, masteryRewards, missionDefs, nextRoadTier, rewardConfig, validLoadout, validatePlayerModel } from '../shift-arena/packages/shared/dist/index.js';

const utcDay = () => new Date().toISOString().slice(0, 10);
const clone = (value) => structuredClone(value);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const initial = (id, name) => ({ user_id: id, display_name: name, selected_character: 'rei', owned_characters: ['rei'], credits: 0, prestige: 0, road_target: 'gald', loadouts: {}, mastery: {}, missions: {}, mission_day: utcDay(), first_win_day: null, solo_day: null, solo_count: 0 });
const normalize = (row) => ({ ...row, mission_day: row.mission_day instanceof Date ? row.mission_day.toISOString().slice(0, 10) : row.mission_day, first_win_day: row.first_win_day instanceof Date ? row.first_win_day.toISOString().slice(0, 10) : row.first_win_day, solo_day: row.solo_day instanceof Date ? row.solo_day.toISOString().slice(0, 10) : row.solo_day });
function today(profile) { if (profile.mission_day !== utcDay()) { profile.mission_day = utcDay(); profile.missions = {}; } }
function mastery(profile, id) { return profile.mastery[id] ||= { xp: 0, stats: { matches: 0, wins: 0, ko: 0, ultimates: 0, objective: 0, hits: 0, terminal: 0 }, claimed: [], equipped_skin: null }; }
function publicProfile(profile) { today(profile); return { ...clone(profile), road_tier: nextRoadTier(profile.owned_characters), mastery_levels: Object.fromEntries(Object.entries(profile.mastery).map(([id, value]) => [id, masteryLevel(value.xp)])), server_day: utcDay() }; }

export class ShiftStore {
  constructor(pool = null) { this.pool = pool; this.memory = new Map(); this.models = new Map(); this.rewards = new Set(); this.locks = new Map(); this.requests = new Map(); this.friends = new Set(); this.blocks = new Set(); }
  async init() {
    if (!this.pool) return;
    const { rows } = await this.pool.query("SELECT to_regclass('public.shift_profiles') AS profiles, to_regclass('public.shift_reward_transactions') AS rewards, to_regclass('public.shift_friend_requests') AS requests, to_regclass('public.shift_friendships') AS friends, to_regclass('public.shift_blocks') AS blocks, to_regclass('public.shift_models') AS models");
    if (Object.values(rows[0] || {}).some(v => !v)) throw new Error('SHIFT ARENA schema missing. Apply migrations/005_shift_arena.sql and 006_shift_models.sql first.');
  }
  async getModel(userId) {
    if (!this.pool) return this.models.get(userId) || null;
    const { rows } = await this.pool.query('SELECT model_doc FROM shift_models WHERE user_id=$1', [userId]);
    return rows[0]?.model_doc || null;
  }
  async saveModel(user, input) {
    if (!user?.id) throw fail('ログインが必要です。', 401);
    const model = validatePlayerModel(input);
    if (Buffer.byteLength(JSON.stringify(model)) > 120000) throw fail('モデルが大きすぎます。');
    if (!this.pool) this.models.set(user.id, model);
    else await this.pool.query('INSERT INTO shift_models(user_id,model_doc) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET model_doc=EXCLUDED.model_doc,updated_at=now()', [user.id, JSON.stringify(model)]);
    return model;
  }
  async clearModel(user) {
    if (!user?.id) throw fail('ログインが必要です。', 401);
    if (!this.pool) this.models.delete(user.id);
    else await this.pool.query('DELETE FROM shift_models WHERE user_id=$1', [user.id]);
    return { ok: true };
  }
  async withProfile(user, change = () => {}) {
    if (!user?.id) throw fail('ログインが必要です。', 401);
    if (!this.pool) {
      const previous = this.locks.get(user.id) || Promise.resolve();
      let release;
      const current = new Promise(resolve => { release = resolve; });
      this.locks.set(user.id, previous.then(() => current));
      await previous;
      try {
        const profile = this.memory.get(user.id) || initial(user.id, user.username);
        today(profile); const result = await change(profile, null); this.memory.set(user.id, profile);
        return result === undefined ? publicProfile(profile) : result;
      } finally { release(); }
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO shift_profiles(user_id,display_name) VALUES ($1,$2) ON CONFLICT(user_id) DO NOTHING', [user.id, user.username]);
      const { rows } = await client.query('SELECT * FROM shift_profiles WHERE user_id=$1 FOR UPDATE', [user.id]);
      const profile = normalize(rows[0]); today(profile);
      const result = await change(profile, client);
      await client.query(`UPDATE shift_profiles SET display_name=$2,selected_character=$3,owned_characters=$4,credits=$5,prestige=$6,road_target=$7,loadouts=$8,mastery=$9,missions=$10,mission_day=$11,first_win_day=$12,solo_day=$13,solo_count=$14,updated_at=now() WHERE user_id=$1`, [user.id,user.username,profile.selected_character,profile.owned_characters,profile.credits,profile.prestige,profile.road_target,JSON.stringify(profile.loadouts),JSON.stringify(profile.mastery),JSON.stringify(profile.missions),profile.mission_day,profile.first_win_day,profile.solo_day,profile.solo_count]);
      await client.query('COMMIT'); return result === undefined ? publicProfile(profile) : result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  getProfile(user) { return this.withProfile(user); }
  setSelected(user, character) { return this.withProfile(user, p => { if (!p.owned_characters.includes(character)) throw fail('未所持のキャラクターです。', 403); p.selected_character = character; }); }
  setTarget(user, character) { return this.withProfile(user, p => { if (!nextRoadTier(p.owned_characters).includes(character)) throw fail('現在のキャラロードで選べません。'); p.road_target = character; }); }
  unlock(user) { return this.withProfile(user, p => {
    const tier = nextRoadTier(p.owned_characters); const id = tier.includes(p.road_target) ? p.road_target : tier[0];
    if (!id) throw fail('すべてのキャラクターを獲得済みです。');
    const cost = characterRoad[id].cost;
    if (p.credits < cost) throw fail('クレジットが不足しています。');
    p.credits -= cost; p.owned_characters.push(id); p.road_target = nextRoadTier(p.owned_characters)[0] || '';
    return { character: id, profile: publicProfile(p) };
  }); }
  setLoadout(user, character, skill, passive) { return this.withProfile(user, p => {
    if (!p.owned_characters.includes(character)) throw fail('未所持のキャラクターです。', 403);
    if (!validLoadout(character, skill, passive)) throw fail('無効なロードアウトです。');
    p.loadouts[character] = { skill, passive };
  }); }
  claimMission(user, id) { return this.withProfile(user, p => {
    const mission = missionDefs.find(m => m.id === id);
    if (!mission) throw fail('ミッションが見つかりません。', 404);
    const progress = p.missions[id] || { count: 0, claimed: false };
    if (progress.count < mission.goal) throw fail('まだ達成していません。');
    if (progress.claimed) throw fail('報酬は受け取り済みです。');
    progress.claimed = true; p.missions[id] = progress; p.credits += mission.credits;
  }); }
  claimMastery(user, character, rewardId) { return this.withProfile(user, p => {
    const reward = masteryRewards.find(r => r.id === rewardId);
    if (!reward || !p.owned_characters.includes(character)) throw fail('報酬が見つかりません。');
    const m = mastery(p, character);
    if (masteryLevel(m.xp) < reward.level) throw fail('必要なレベルに達していません。');
    if (m.claimed.includes(rewardId)) throw fail('受け取り済みです。');
    m.claimed.push(rewardId);
  }); }
  equipMasterySkin(user, character, skin) { return this.withProfile(user, p => {
    if (!p.owned_characters.includes(character)) throw fail('未所持のキャラクターです。', 403);
    if (skin !== null && !['skin', 'master_skin'].includes(skin)) throw fail('無効なスキンです。');
    const m = mastery(p, character);
    if (skin !== null && !m.claimed.includes(skin)) throw fail('このスキンを獲得していません。', 403);
    m.equipped_skin = skin;
  }); }
  async awardMatch(user, result) { return this.withProfile(user, async (p, client) => {
    const { matchId, character, won, source, seconds, kills = 0, objective = 0, ultimates = 0, hits = 0, terminal = 0 } = result;
    if (!matchId || !p.owned_characters.includes(character)) return { credited: false };
    if (seconds < rewardConfig.minActiveSeconds || kills + objective + hits < rewardConfig.minParticipation) return { credited: false };
    if (source === 'private' || source === 'training') return { credited: false };
    if (source === 'solo' && p.solo_day !== utcDay()) { p.solo_day = utcDay(); p.solo_count = 0; }
    if (source === 'solo' && p.solo_count >= rewardConfig.soloDailyLimit) return { credited: false };
    const key = `${matchId}:${user.id}`;
    if (client) {
      const { rowCount } = await client.query('INSERT INTO shift_reward_transactions(match_id,user_id,credits,mastery_xp) VALUES ($1,$2,0,0) ON CONFLICT DO NOTHING', [matchId,user.id]);
      if (!rowCount) return { credited: false };
    } else if (this.rewards.has(key)) return { credited: false };
    else this.rewards.add(key);
    const firstWin = source === 'online' && won && p.first_win_day !== utcDay();
    const amount = source === 'solo' ? rewardConfig.solo : (won ? rewardConfig.onlineWin : rewardConfig.onlineLoss) + (firstWin ? rewardConfig.firstWin : 0);
    const xp = (won ? 20 : 10) + Math.min(20, kills * 2 + Math.floor(objective / 5));
    if (source === 'solo') p.solo_count++;
    if (firstWin) p.first_win_day = utcDay();
    if (!nextRoadTier(p.owned_characters).length) p.prestige += amount; else p.credits += amount;
    const m = mastery(p, character); m.xp += xp; m.stats.matches++; m.stats.wins += Number(won); m.stats.ko += kills; m.stats.objective += objective; m.stats.ultimates += ultimates; m.stats.hits += hits; m.stats.terminal += terminal;
    for (const [id, count] of Object.entries({ play3: 1, win1: Number(won), ko10: kills, ult5: ultimates, objective30: objective })) {
      const mission = missionDefs.find(item => item.id === id);
      const entry = p.missions[id] || { count: 0, claimed: false };
      entry.count = Math.min(mission.goal, entry.count + count); p.missions[id] = entry;
    }
    if (client) await client.query('UPDATE shift_reward_transactions SET credits=$3,mastery_xp=$4 WHERE match_id=$1 AND user_id=$2', [matchId,user.id,amount,xp]);
    return { credited: true, credits: amount, xp, profile: publicProfile(p) };
  }); }
  async searchUsers(user, query) {
    const key = String(query || '').trim().slice(0, 24).toLowerCase();
    if (key.length < 2) return [];
    if (!this.pool) return [...this.memory.values()].filter(p => p.user_id !== user.id && (p.display_name.toLowerCase().includes(key) || p.user_id.startsWith(key))).slice(0, 20).map(p => ({ id: p.user_id, name: p.display_name }));
    const { rows } = await this.pool.query('SELECT id,username AS name FROM users WHERE id<>$1 AND (lower(username) LIKE $2 OR id::text LIKE $2) ORDER BY username LIMIT 20', [user.id, `%${key}%`]); return rows;
  }
  async friendState(user) {
    if (!this.pool) { const profiles = [...this.memory.values()]; return { friends: profiles.filter(p => this.friends.has([user.id,p.user_id].sort().join(':'))).map(p => ({ id:p.user_id,name:p.display_name })), requests: [...this.requests.values()].filter(r => r.recipient_id === user.id && r.status === 'pending'), blocked: [...this.blocks].filter(v => v.startsWith(`${user.id}:`)).map(v => v.slice(user.id.length + 1)) }; }
    const [friends, requests, blocked] = await Promise.all([
      this.pool.query('SELECT u.id,u.username AS name FROM shift_friendships f JOIN users u ON u.id=CASE WHEN f.user_low=$1 THEN f.user_high ELSE f.user_low END WHERE f.user_low=$1 OR f.user_high=$1 ORDER BY u.username', [user.id]),
      this.pool.query("SELECT r.id,r.sender_id,r.created_at,u.username AS name FROM shift_friend_requests r JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=$1 AND r.status='pending' ORDER BY r.created_at DESC", [user.id]),
      this.pool.query('SELECT target_id FROM shift_blocks WHERE owner_id=$1', [user.id])]);
    return { friends: friends.rows, requests: requests.rows, blocked: blocked.rows.map(r => r.target_id) };
  }
  async areFriends(a,b){const [low,high]=[a,b].sort();if(!this.pool)return this.friends.has(`${low}:${high}`)&&!this.blocks.has(`${a}:${b}`)&&!this.blocks.has(`${b}:${a}`);const {rowCount}=await this.pool.query('SELECT 1 FROM shift_friendships WHERE user_low=$1 AND user_high=$2 AND NOT EXISTS(SELECT 1 FROM shift_blocks WHERE (owner_id=$1 AND target_id=$2) OR (owner_id=$2 AND target_id=$1))',[low,high]);return rowCount>0;}
  async friendRequest(user, targetId) {
    if (targetId === user.id) throw fail('自分には申請できません。');
    if (!this.pool) {
      if (!this.memory.has(targetId)) throw fail('プレイヤーが見つかりません。', 404);
      if (this.blocks.has(`${targetId}:${user.id}`) || this.blocks.has(`${user.id}:${targetId}`)) throw fail('このプレイヤーには申請できません。', 403);
      if (this.friends.has([user.id,targetId].sort().join(':'))) throw fail('すでにフレンドです。');
      if ([...this.requests.values()].some(r => r.sender_id === user.id && r.recipient_id === targetId && r.status === 'pending')) throw fail('申請済みです。');
      const request = { id: randomUUID(), sender_id: user.id, recipient_id: targetId, name: user.username, status: 'pending' }; this.requests.set(request.id, request); return request;
    }
    const client = await this.pool.connect();
    try { await client.query('BEGIN');
      const { rows } = await client.query('SELECT id FROM users WHERE id=$1', [targetId]); if (!rows.length) throw fail('プレイヤーが見つかりません。', 404);
      const blocked = await client.query('SELECT 1 FROM shift_blocks WHERE (owner_id=$1 AND target_id=$2) OR (owner_id=$2 AND target_id=$1)', [user.id,targetId]); if (blocked.rowCount) throw fail('このプレイヤーには申請できません。', 403);
      const [low,high]=[user.id,targetId].sort(); const friends=await client.query('SELECT 1 FROM shift_friendships WHERE user_low=$1 AND user_high=$2',[low,high]); if(friends.rowCount)throw fail('すでにフレンドです。');
      const id=randomUUID(); await client.query('INSERT INTO shift_friend_requests(id,sender_id,recipient_id) VALUES($1,$2,$3)',[id,user.id,targetId]); await client.query('COMMIT'); return {id};
    } catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw fail('申請済みです。');throw error;} finally{client.release();}
  }
  async decideFriend(user, requestId, accept) {
    if (!this.pool) { const r=this.requests.get(requestId);if(!r||r.recipient_id!==user.id||r.status!=='pending')throw fail('申請が見つかりません。',404);if(this.blocks.has(`${user.id}:${r.sender_id}`)||this.blocks.has(`${r.sender_id}:${user.id}`))throw fail('ブロック中です。',403);r.status=accept?'accepted':'declined';if(accept)this.friends.add([user.id,r.sender_id].sort().join(':'));return; }
    const client=await this.pool.connect();try{await client.query('BEGIN');const {rows}=await client.query("SELECT * FROM shift_friend_requests WHERE id=$1 AND recipient_id=$2 AND status='pending' FOR UPDATE",[requestId,user.id]);const r=rows[0];if(!r)throw fail('申請が見つかりません。',404);if(accept){const blocked=await client.query('SELECT 1 FROM shift_blocks WHERE (owner_id=$1 AND target_id=$2) OR (owner_id=$2 AND target_id=$1)',[user.id,r.sender_id]);if(blocked.rowCount)throw fail('ブロック中です。',403);const[low,high]=[user.id,r.sender_id].sort();await client.query('INSERT INTO shift_friendships(user_low,user_high) VALUES($1,$2) ON CONFLICT DO NOTHING',[low,high]);}await client.query('UPDATE shift_friend_requests SET status=$2,decided_at=now() WHERE id=$1',[requestId,accept?'accepted':'declined']);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async unfriend(user,targetId){const key=[user.id,targetId].sort();if(!this.pool){this.friends.delete(key.join(':'));return;}await this.pool.query('DELETE FROM shift_friendships WHERE user_low=$1 AND user_high=$2',key);}
  async block(user,targetId){if(targetId===user.id)throw fail('自分はブロックできません。');const key=[user.id,targetId].sort();if(!this.pool){this.blocks.add(`${user.id}:${targetId}`);this.friends.delete(key.join(':'));return;}const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO shift_blocks(owner_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,targetId]);await client.query('DELETE FROM shift_friendships WHERE user_low=$1 AND user_high=$2',key);await client.query("UPDATE shift_friend_requests SET status='declined',decided_at=now() WHERE status='pending' AND ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1))",[user.id,targetId]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
}
