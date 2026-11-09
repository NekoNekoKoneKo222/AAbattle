import { randomUUID } from 'node:crypto';
import pg from 'pg';

export class TradeError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}

const tradeExpired = (trade) => trade.status === 'pending' && new Date(trade.expires_at).getTime() <= Date.now();
const publicFighter = (fighter) => fighter && ({
  id: fighter.id, name: fighter.name, art: fighter.art,
  definition: fighter.definition, generation_mode: fighter.generation_mode
});

export function createStore(connectionString = process.env.DATABASE_URL) {
  if (connectionString) return new PostgresStore(connectionString);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production; ephemeral accounts are not allowed.');
  }
  return new MemoryStore();
}

export class MemoryStore {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.fighters = new Map();
    this.matches = [];
    this.pveMatches = [];
    this.trades = new Map();
  }
  async init() {}
  async close() {}
  async createUser(username, usernameKey, passwordHash) {
    if ([...this.users.values()].some((u) => u.username_key === usernameKey)) return null;
    const user = { id: randomUUID(), username, username_key: usernameKey, password_hash: passwordHash, wins: 0, losses: 0 };
    this.users.set(user.id, user);
    return user;
  }
  async findUser(usernameKey) {
    return [...this.users.values()].find((u) => u.username_key === usernameKey) || null;
  }
  async getUser(id) { return this.users.get(id) || null; }
  async saveSession(tokenHash, userId, expiresAt) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async findSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt < Date.now()) return null;
    return this.getUser(session.userId);
  }
  async deleteSession(tokenHash) { this.sessions.delete(tokenHash); }
  async saveFighter(ownerId, name, art, definition, generationMode) {
    const fighter = { id: randomUUID(), owner_id: ownerId, name, art, definition, generation_mode: generationMode, created_at: new Date().toISOString() };
    this.fighters.set(fighter.id, fighter);
    return fighter;
  }
  async listFighters(ownerId) {
    return [...this.fighters.values()].filter((f) => f.owner_id === ownerId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async getFighter(id) { return this.fighters.get(id) || null; }
  async publicFighters(usernameKey) {
    const user = await this.findUser(usernameKey);
    if (!user) return null;
    return { username: user.username, fighters: (await this.listFighters(user.id)).map(publicFighter) };
  }
  tradeDetails(trade) {
    if (!trade) return null;
    return {
      ...trade, status: tradeExpired(trade) ? 'expired' : trade.status,
      sender_username: this.users.get(trade.sender_id)?.username,
      recipient_username: this.users.get(trade.recipient_id)?.username,
      offered_fighter: publicFighter(this.fighters.get(trade.offered_fighter_id)),
      requested_fighter: publicFighter(this.fighters.get(trade.requested_fighter_id))
    };
  }
  async createTrade(senderId, recipientKey, offeredId, requestedId) {
    const recipient = await this.findUser(recipientKey);
    if (!recipient) throw new TradeError('交換相手のユーザーが見つかりません。', 404);
    if (recipient.id === senderId) throw new TradeError('自分自身とは交換できません。', 400);
    const offered = this.fighters.get(offeredId);
    const requested = this.fighters.get(requestedId);
    if (!offered || offered.owner_id !== senderId || !requested || requested.owner_id !== recipient.id) {
      throw new TradeError('キャラクターの所有者が変わりました。再検索してください。');
    }
    if ([...this.trades.values()].some((t) => t.status === 'pending' && !tradeExpired(t) &&
      t.sender_id === senderId && t.recipient_id === recipient.id && t.offered_fighter_id === offeredId && t.requested_fighter_id === requestedId)) {
      throw new TradeError('同じ内容の交換申請がすでにあります。');
    }
    const now = new Date();
    const trade = {
      id: randomUUID(), sender_id: senderId, recipient_id: recipient.id,
      offered_fighter_id: offeredId, requested_fighter_id: requestedId,
      status: 'pending', created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 24 * 3600000).toISOString(), decided_at: null
    };
    this.trades.set(trade.id, trade);
    return this.tradeDetails(trade);
  }
  async getTrade(id) { return this.tradeDetails(this.trades.get(id)); }
  async listTrades(userId) {
    return [...this.trades.values()].filter((t) => t.sender_id === userId || t.recipient_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((t) => this.tradeDetails(t));
  }
  async decideTrade(id, userId, action) {
    const trade = this.trades.get(id);
    if (!trade) throw new TradeError('交換申請が見つかりません。', 404);
    if (action === 'cancel' ? trade.sender_id !== userId : trade.recipient_id !== userId) {
      throw new TradeError('この交換申請を操作する権限がありません。', 403);
    }
    if (tradeExpired(trade) || trade.status !== 'pending') throw new TradeError('交換申請は終了または期限切れです。');
    if (action === 'accept') {
      const offered = this.fighters.get(trade.offered_fighter_id);
      const requested = this.fighters.get(trade.requested_fighter_id);
      if (!offered || !requested || offered.owner_id !== trade.sender_id || requested.owner_id !== trade.recipient_id) {
        throw new TradeError('キャラクターの所有者が変わったため交換できません。');
      }
      offered.owner_id = trade.recipient_id;
      requested.owner_id = trade.sender_id;
    }
    trade.status = { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[action];
    trade.decided_at = new Date().toISOString();
    return this.tradeDetails(trade);
  }
  async saveMatch(playerA, playerB, winnerId, transcript) {
    const match = { id: randomUUID(), player_a: playerA, player_b: playerB, winner_id: winnerId, transcript, created_at: new Date().toISOString() };
    this.matches.push(match);
    for (const userId of [playerA, playerB]) {
      const user = this.users.get(userId);
      if (user) user[userId === winnerId ? 'wins' : 'losses']++;
    }
    return match;
  }
  async historyForUser(userId) {
    return this.matches.filter((m) => m.player_a === userId || m.player_b === userId).slice(-20).reverse();
  }
  async savePveMatch(userId, fighter, result) {
    const record = {
      id: result.id, user_id: userId, fighter_id: fighter.id, fighter_name: fighter.name,
      enemy_key: result.difficulty, enemy_name: result.enemy, won: result.won,
      turns: result.turns, transcript: result.log, created_at: new Date().toISOString()
    };
    this.pveMatches.push(record);
    return record;
  }
  async pveHistoryForUser(userId) {
    const all = this.pveMatches.filter((m) => m.user_id === userId);
    return {
      wins: all.filter((m) => m.won).length,
      losses: all.filter((m) => !m.won).length,
      matches: all.slice(-20).reverse().map(({ transcript, ...m }) => m)
    };
  }
}

class PostgresStore {
  constructor(connectionString) {
    // Neon compute may sleep while Render is idle. Bound connection and query
    // waits so the browser receives a recoverable error instead of hanging.
    this.pool = new pg.Pool({
      connectionString,
      max: 8,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      query_timeout: 15000,
      statement_timeout: 15000,
      keepAlive: true
    });
  }
  async init() {
    const { rows } = await this.pool.query("SELECT to_regclass('public.users') AS users, to_regclass('public.sessions') AS sessions, to_regclass('public.fighters') AS fighters, to_regclass('public.matches') AS matches, to_regclass('public.trades') AS trades, to_regclass('public.pve_matches') AS pve_matches");
    if (!rows[0] || Object.values(rows[0]).some((v) => v === null)) {
      throw new Error('Database schema missing. Apply migrations/001_init.sql through migrations/003_pve.sql through a direct PostgreSQL connection first.');
    }
  }
  async close() { await this.pool.end(); }
  async createUser(username, key, hash) {
    const result = await this.pool.query(
      'INSERT INTO users (id, username, username_key, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (username_key) DO NOTHING RETURNING *',
      [randomUUID(), username, key, hash]);
    return result.rows[0] || null;
  }
  async findUser(key) { return (await this.pool.query('SELECT * FROM users WHERE username_key=$1', [key])).rows[0] || null; }
  async getUser(id) { return (await this.pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0] || null; }
  async saveSession(hash, userId, expiresAt) {
    await this.pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [hash, userId, new Date(expiresAt)]);
  }
  async findSession(hash) {
    const { rows } = await this.pool.query(
      'SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > NOW()', [hash]);
    return rows[0] || null;
  }
  async deleteSession(hash) { await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash]); }
  async saveFighter(ownerId, name, art, definition, mode) {
    const { rows } = await this.pool.query(
      'INSERT INTO fighters (id,owner_id,name,art,definition,generation_mode) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [randomUUID(), ownerId, name, art, JSON.stringify(definition), mode]);
    return rows[0];
  }
  async listFighters(ownerId) {
    return (await this.pool.query('SELECT * FROM fighters WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100', [ownerId])).rows;
  }
  async getFighter(id) { return (await this.pool.query('SELECT * FROM fighters WHERE id=$1', [id])).rows[0] || null; }
  async publicFighters(usernameKey) {
    const user = await this.findUser(usernameKey);
    if (!user) return null;
    const fighters = await this.listFighters(user.id);
    return { username: user.username, fighters: fighters.map(publicFighter) };
  }
  tradeSelect() {
    return `SELECT t.*, CASE WHEN t.status='pending' AND t.expires_at <= NOW() THEN 'expired' ELSE t.status END AS status,
      sender.username AS sender_username, recipient.username AS recipient_username,
      json_build_object('id', offered.id, 'name', offered.name, 'art', offered.art, 'definition', offered.definition, 'generation_mode', offered.generation_mode) AS offered_fighter,
      json_build_object('id', requested.id, 'name', requested.name, 'art', requested.art, 'definition', requested.definition, 'generation_mode', requested.generation_mode) AS requested_fighter
      FROM trades t JOIN users sender ON t.sender_id=sender.id JOIN users recipient ON t.recipient_id=recipient.id
      JOIN fighters offered ON t.offered_fighter_id=offered.id JOIN fighters requested ON t.requested_fighter_id=requested.id`;
  }
  async createTrade(senderId, recipientKey, offeredId, requestedId) {
    const recipient = await this.findUser(recipientKey);
    if (!recipient) throw new TradeError('交換相手のユーザーが見つかりません。', 404);
    if (recipient.id === senderId) throw new TradeError('自分自身とは交換できません。', 400);
    const client = await this.pool.connect();
    let id;
    try {
      await client.query('BEGIN');
      await client.query("UPDATE trades SET status='cancelled', decided_at=NOW() WHERE status='pending' AND expires_at <= NOW() AND sender_id=$1", [senderId]);
      // Lock fighter rows in a stable order while checking their current owners.
      const { rows } = await client.query('SELECT id, owner_id FROM fighters WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[offeredId, requestedId]]);
      if (rows.length !== 2 || !rows.some((f) => f.id === offeredId && f.owner_id === senderId) ||
          !rows.some((f) => f.id === requestedId && f.owner_id === recipient.id)) {
        throw new TradeError('キャラクターの所有者が変わりました。再検索してください。');
      }
      id = randomUUID();
      await client.query('INSERT INTO trades (id,sender_id,recipient_id,offered_fighter_id,requested_fighter_id) VALUES ($1,$2,$3,$4,$5)',
        [id, senderId, recipient.id, offeredId, requestedId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new TradeError('同じ内容の交換申請がすでにあります。');
      throw error;
    } finally { client.release(); }
    return this.getTrade(id);
  }
  async getTrade(id) {
    return (await this.pool.query(`${this.tradeSelect()} WHERE t.id=$1`, [id])).rows[0] || null;
  }
  async listTrades(userId) {
    return (await this.pool.query(`${this.tradeSelect()} WHERE t.sender_id=$1 OR t.recipient_id=$1 ORDER BY t.created_at DESC LIMIT 100`, [userId])).rows;
  }
  async decideTrade(id, userId, action) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM trades WHERE id=$1 FOR UPDATE', [id]);
      const trade = rows[0];
      if (!trade) throw new TradeError('交換申請が見つかりません。', 404);
      if (action === 'cancel' ? trade.sender_id !== userId : trade.recipient_id !== userId) {
        throw new TradeError('この交換申請を操作する権限がありません。', 403);
      }
      if (trade.status !== 'pending' || new Date(trade.expires_at).getTime() <= Date.now()) {
        throw new TradeError('交換申請は終了または期限切れです。');
      }
      if (action === 'accept') {
        const { rows: fighters } = await client.query('SELECT id, owner_id FROM fighters WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [[trade.offered_fighter_id, trade.requested_fighter_id]]);
        if (fighters.length !== 2 || !fighters.some((f) => f.id === trade.offered_fighter_id && f.owner_id === trade.sender_id) ||
            !fighters.some((f) => f.id === trade.requested_fighter_id && f.owner_id === trade.recipient_id)) {
          throw new TradeError('キャラクターの所有者が変わったため交換できません。');
        }
        await client.query(`UPDATE fighters SET owner_id = CASE
          WHEN id=$1 THEN $3::uuid WHEN id=$2 THEN $4::uuid ELSE owner_id END
          WHERE id IN ($1,$2)`, [trade.offered_fighter_id, trade.requested_fighter_id, trade.recipient_id, trade.sender_id]);
      }
      const status = { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[action];
      await client.query('UPDATE trades SET status=$2, decided_at=NOW() WHERE id=$1', [id, status]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return this.getTrade(id);
  }
  async saveMatch(playerA, playerB, winnerId, transcript) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO matches (id,player_a,player_b,winner_id,transcript) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [randomUUID(), playerA, playerB, winnerId, JSON.stringify(transcript)]);
      await client.query('UPDATE users SET wins = wins+1 WHERE id=$1', [winnerId]);
      const loserId = winnerId === playerA ? playerB : playerA;
      await client.query('UPDATE users SET losses=losses+1 WHERE id=$1', [loserId]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async historyForUser(userId) {
    return (await this.pool.query(
      'SELECT id,player_a,player_b,winner_id,created_at FROM matches WHERE player_a=$1 OR player_b=$1 ORDER BY created_at DESC LIMIT 20', [userId])).rows;
  }
  async savePveMatch(userId, fighter, result) {
    const { rows } = await this.pool.query(
      `INSERT INTO pve_matches (id,user_id,fighter_id,fighter_name,enemy_key,enemy_name,won,turns,transcript)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,user_id,fighter_id,fighter_name,enemy_key,enemy_name,won,turns,created_at`,
      [result.id, userId, fighter.id, fighter.name, result.difficulty, result.enemy, result.won, result.turns, JSON.stringify(result.log)]);
    return rows[0];
  }
  async pveHistoryForUser(userId) {
    const [list, totals] = await Promise.all([
      this.pool.query(`SELECT id,user_id,fighter_id,fighter_name,enemy_key,enemy_name,won,turns,created_at
        FROM pve_matches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]),
      this.pool.query(`SELECT COUNT(*) FILTER (WHERE won) AS wins, COUNT(*) FILTER (WHERE NOT won) AS losses
        FROM pve_matches WHERE user_id=$1`, [userId])
    ]);
    return { wins: Number(totals.rows[0].wins), losses: Number(totals.rows[0].losses), matches: list.rows };
  }
}
