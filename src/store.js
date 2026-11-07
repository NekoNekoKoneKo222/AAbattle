import { randomUUID } from 'node:crypto';
import pg from 'pg';

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
    const { rows } = await this.pool.query("SELECT to_regclass('public.users') AS users, to_regclass('public.sessions') AS sessions, to_regclass('public.fighters') AS fighters, to_regclass('public.matches') AS matches");
    if (!rows[0] || Object.values(rows[0]).some((v) => v === null)) {
      throw new Error('Database schema missing. Apply migrations/001_init.sql through a direct PostgreSQL connection first.');
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
}
