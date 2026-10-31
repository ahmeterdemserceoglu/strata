import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

export * from './types.js';
export { pg };

let dbInstance: Kysely<Database> | null = null;
let poolInstance: pg.Pool | null = null;

export function getPgPool(connectionString?: string): pg.Pool {
  if (!poolInstance) {
    const conn = connectionString || process.env.DATABASE_URL;
    const isSupabaseOrCloud = Boolean(conn && !conn.includes('localhost') && !conn.includes('127.0.0.1'));
    poolInstance = new pg.Pool({
      connectionString: conn,
      max: 20,
      ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined
    });
  }
  return poolInstance;
}

export function createDatabase(connectionString?: string): Kysely<Database> {
  const pool = getPgPool(connectionString);
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool
    })
  });
}

export function getDatabase(): Kysely<Database> {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}

export const MIGRATION_001_AUTH_SQL = `
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  username CITEXT NOT NULL UNIQUE,
  display_name VARCHAR(64),
  email CITEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,
  avatar_hash VARCHAR(64),
  banner_hash VARCHAR(64),
  bio TEXT,
  flags INT NOT NULL DEFAULT 0,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_enc TEXT,
  token_version INT NOT NULL DEFAULT 1,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr-TR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(32) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(100),
  client_type VARCHAR(20) NOT NULL DEFAULT 'web',
  ip VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  session_id VARCHAR(64) NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guilds (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  owner_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  icon_hash VARCHAR(64),
  member_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id VARCHAR(32) PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  parent_id VARCHAR(32),
  type VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  topic TEXT,
  position INT NOT NULL DEFAULT 0,
  permissions_synced BOOLEAN NOT NULL DEFAULT TRUE,
  overwrites JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id VARCHAR(32) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(64),
  role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  code VARCHAR(32) PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id VARCHAR(32) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  inviter_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INT NOT NULL DEFAULT 0,
  uses INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(32) PRIMARY KEY,
  channel_id VARCHAR(32) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  nonce VARCHAR(64),
  ref_message_id VARCHAR(32),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  mention_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  mention_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session ON refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_channels_guild_id ON channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id, id DESC);
`;

