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
    this.pool = new pg.Pool({ connectionString, max: 8 });
  }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY, username VARCHAR(64) NOT NULL,
        username_key VARCHAR(64) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fighters (
        id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(64) NOT NULL, art TEXT NOT NULL, definition JSONB NOT NULL,
        generation_mode VARCHAR(20) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY, player_a UUID NOT NULL REFERENCES users(id),
        player_b UUID NOT NULL REFERENCES users(id), winner_id UUID REFERENCES users(id),
        transcript JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS fighters_by_owner ON fighters(owner_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS matches_by_a ON matches(player_a, created_at DESC);
      CREATE INDEX IF NOT EXISTS matches_by_b ON matches(player_b, created_at DESC);
    `);
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
