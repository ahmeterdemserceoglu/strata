import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

export interface UserEntity {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  passwordHash: string | null;
  avatarHash: string | null;
  flags: number;
  mfaEnabled: boolean;
  mfaSecretEnc: string | null;
  tokenVersion: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface SessionEntity {
  id: string;
  userId: string;
  deviceName: string | null;
  clientType: 'web' | 'desktop' | 'mobile';
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenEntity {
  id: string;
  tokenHash: string;
  sessionId: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IAuthStore {
  createUser(user: Omit<UserEntity, 'createdAt' | 'deletedAt'>): Promise<UserEntity>;
  findUserById(id: string): Promise<UserEntity | null>;
  findUserByEmail(email: string): Promise<UserEntity | null>;
  findUserByUsername(username: string): Promise<UserEntity | null>;
  listAllUsers(): Promise<UserEntity[]>;
  updateUser(id: string, updates: Partial<UserEntity>): Promise<UserEntity>;
  createSession(session: Omit<SessionEntity, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<SessionEntity>;
  findSessionById(sessionId: string): Promise<SessionEntity | null>;
  findSessionsByUserId(userId: string): Promise<SessionEntity[]>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
  saveRefreshToken(token: Omit<RefreshTokenEntity, 'id' | 'usedAt' | 'createdAt'>): Promise<RefreshTokenEntity>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenEntity | null>;
  markRefreshTokenUsed(id: string): Promise<void>;
  saveBackupCodes(userId: string, codeHashes: string[]): Promise<void>;
  consumeBackupCode(userId: string, codeHash: string): Promise<boolean>;
}

/**
 * Supabase / PostgreSQL Auth Store
 */
export class PostgresAuthStore implements IAuthStore {
  constructor(private pool: pg.Pool) {}

  private mapUser(row: any): UserEntity {
    return {
      id: String(row.id),
      username: String(row.username),
      displayName: row.display_name ?? null,
      email: String(row.email),
      emailVerified: Boolean(row.email_verified),
      passwordHash: row.password_hash ?? null,
      avatarHash: row.avatar_hash ?? null,
      flags: Number(row.flags ?? 0),
      mfaEnabled: Boolean(row.mfa_enabled),
      mfaSecretEnc: row.mfa_secret_enc ?? null,
      tokenVersion: Number(row.token_version ?? 1),
      createdAt: new Date(row.created_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null
    };
  }

  private mapSession(row: any): SessionEntity {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      deviceName: row.device_name ?? null,
      clientType: (row.client_type || 'desktop') as 'web' | 'desktop' | 'mobile',
      ip: row.ip ?? null,
      userAgent: row.user_agent ?? null,
      createdAt: new Date(row.created_at),
      lastUsedAt: new Date(row.last_used_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null
    };
  }

  private mapRefreshToken(row: any): RefreshTokenEntity {
    return {
      id: String(row.id),
      tokenHash: String(row.token_hash),
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
      createdAt: new Date(row.created_at)
    };
  }

  async createUser(data: Omit<UserEntity, 'createdAt' | 'deletedAt'>): Promise<UserEntity> {
    const res = await this.pool.query(
      `INSERT INTO users (
        id, username, display_name, email, email_verified, password_hash,
        avatar_hash, flags, mfa_enabled, mfa_secret_enc, token_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        data.id,
        data.username,
        data.displayName,
        data.email,
        data.emailVerified,
        data.passwordHash,
        data.avatarHash,
        data.flags,
        data.mfaEnabled,
        data.mfaSecretEnc,
        data.tokenVersion
      ]
    );
    return this.mapUser(res.rows[0]);
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    return res.rows[0] ? this.mapUser(res.rows[0]) : null;
  }

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE LOWER(email::text) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
      [email]
    );
    return res.rows[0] ? this.mapUser(res.rows[0]) : null;
  }

  async findUserByUsername(username: string): Promise<UserEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE LOWER(username::text) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
      [username]
    );
    return res.rows[0] ? this.mapUser(res.rows[0]) : null;
  }

  async listAllUsers(): Promise<UserEntity[]> {
    const res = await this.pool.query(`SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC`);
    return res.rows.map((r) => this.mapUser(r));
  }

  async updateUser(id: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const current = await this.findUserById(id);
    if (!current) throw new Error('Kullanıcı bulunamadı');
    const merged = { ...current, ...updates };
    const res = await this.pool.query(
      `UPDATE users SET
        username = $2,
        display_name = $3,
        email = $4,
        email_verified = $5,
        password_hash = $6,
        avatar_hash = $7,
        flags = $8,
        mfa_enabled = $9,
        mfa_secret_enc = $10,
        token_version = $11
      WHERE id = $1
      RETURNING *`,
      [
        id,
        merged.username,
        merged.displayName,
        merged.email,
        merged.emailVerified,
        merged.passwordHash,
        merged.avatarHash,
        merged.flags,
        merged.mfaEnabled,
        merged.mfaSecretEnc,
        merged.tokenVersion
      ]
    );
    return this.mapUser(res.rows[0]);
  }

  async createSession(data: Omit<SessionEntity, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<SessionEntity> {
    const res = await this.pool.query(
      `INSERT INTO auth_sessions (id, user_id, device_name, client_type, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [data.id, data.userId, data.deviceName, data.clientType, data.ip, data.userAgent]
    );
    return this.mapSession(res.rows[0]);
  }

  async findSessionById(sessionId: string): Promise<SessionEntity | null> {
    const res = await this.pool.query(`SELECT * FROM auth_sessions WHERE id = $1 LIMIT 1`, [sessionId]);
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  async findSessionsByUserId(userId: string): Promise<SessionEntity[]> {
    const res = await this.pool.query(
      `SELECT * FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_used_at DESC`,
      [userId]
    );
    return res.rows.map((r) => this.mapSession(r));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, [sessionId]);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1`, [userId]);
  }

  async saveRefreshToken(data: Omit<RefreshTokenEntity, 'id' | 'usedAt' | 'createdAt'>): Promise<RefreshTokenEntity> {
    const res = await this.pool.query(
      `INSERT INTO refresh_tokens (token_hash, session_id, user_id, expires_at)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [data.tokenHash, data.sessionId, data.userId, data.expiresAt]
    );
    return this.mapRefreshToken(res.rows[0]);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    const res = await this.pool.query(`SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`, [tokenHash]);
    return res.rows[0] ? this.mapRefreshToken(res.rows[0]) : null;
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1`, [id]);
  }

  async saveBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.pool.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]);
    for (const hash of codeHashes) {
      await this.pool.query(
        `INSERT INTO mfa_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, hash]
      );
    }
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE mfa_backup_codes SET used_at = NOW()
       WHERE id = (
         SELECT id FROM mfa_backup_codes
         WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
         LIMIT 1
       )
       RETURNING id`,
      [userId, codeHash]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export class InMemoryAuthStore implements IAuthStore {
  private users = new Map<string, UserEntity>();
  private sessions = new Map<string, SessionEntity>();
  private refreshTokens = new Map<string, RefreshTokenEntity>();
  private backupCodes = new Map<string, { userId: string; codeHash: string; used: boolean }[]>();
  private persistFilePath: string | null = null;

  constructor(options?: { persistFilePath?: string }) {
    if (options?.persistFilePath) {
      this.persistFilePath = options.persistFilePath;
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (!this.persistFilePath || !fs.existsSync(this.persistFilePath)) return;
    try {
      const raw = fs.readFileSync(this.persistFilePath, 'utf8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          this.users.set(u.id, {
            ...u,
            createdAt: new Date(u.createdAt),
            deletedAt: u.deletedAt ? new Date(u.deletedAt) : null
          });
        }
      }

      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          this.sessions.set(s.id, {
            ...s,
            createdAt: new Date(s.createdAt),
            lastUsedAt: new Date(s.lastUsedAt),
            revokedAt: s.revokedAt ? new Date(s.revokedAt) : null
          });
        }
      }

      if (Array.isArray(data.refreshTokens)) {
        for (const t of data.refreshTokens) {
          this.refreshTokens.set(t.tokenHash, {
            ...t,
            expiresAt: new Date(t.expiresAt),
            usedAt: t.usedAt ? new Date(t.usedAt) : null,
            createdAt: new Date(t.createdAt)
          });
        }
      }

      if (data.backupCodes && typeof data.backupCodes === 'object') {
        for (const [k, v] of Object.entries(data.backupCodes)) {
          this.backupCodes.set(k, v as { userId: string; codeHash: string; used: boolean }[]);
        }
      }
    } catch (err) {
      console.error('AuthStore diskten yuklenemedi:', err);
    }
  }

  private saveToDisk(): void {
    if (!this.persistFilePath) return;
    try {
      fs.mkdirSync(path.dirname(this.persistFilePath), { recursive: true });
      const payload = {
        users: Array.from(this.users.values()),
        sessions: Array.from(this.sessions.values()),
        refreshTokens: Array.from(this.refreshTokens.values()),
        backupCodes: Object.fromEntries(this.backupCodes.entries())
      };
      fs.writeFileSync(this.persistFilePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('AuthStore diske kaydedilemedi:', err);
    }
  }

  async createUser(data: Omit<UserEntity, 'createdAt' | 'deletedAt'>): Promise<UserEntity> {
    const user: UserEntity = {
      ...data,
      createdAt: new Date(),
      deletedAt: null
    };
    this.users.set(user.id, user);
    this.saveToDisk();
    return user;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    const u = this.users.get(id);
    return u && !u.deletedAt ? u : null;
  }

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const lower = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === lower && !u.deletedAt) return u;
    }
    return null;
  }

  async findUserByUsername(username: string): Promise<UserEntity | null> {
    const lower = username.toLowerCase();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === lower && !u.deletedAt) return u;
    }
    return null;
  }

  async listAllUsers(): Promise<UserEntity[]> {
    return Array.from(this.users.values()).filter((u) => !u.deletedAt);
  }

  async updateUser(id: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const u = this.users.get(id);
    if (!u) throw new Error('Kullanıcı bulunamadı');
    const updated = { ...u, ...updates };
    this.users.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  async createSession(data: Omit<SessionEntity, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<SessionEntity> {
    const session: SessionEntity = {
      ...data,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      revokedAt: null
    };
    this.sessions.set(session.id, session);
    this.saveToDisk();
    return session;
  }

  async findSessionById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) || null;
  }

  async findSessionsByUserId(userId: string): Promise<SessionEntity[]> {
    const list: SessionEntity[] = [];
    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) list.push(s);
    }
    return list;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.revokedAt = new Date();
      this.saveToDisk();
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.userId === userId) {
        s.revokedAt = new Date();
      }
    }
    this.saveToDisk();
  }

  async saveRefreshToken(data: Omit<RefreshTokenEntity, 'id' | 'usedAt' | 'createdAt'>): Promise<RefreshTokenEntity> {
    const id = Math.random().toString(36).substring(2);
    const token: RefreshTokenEntity = {
      id,
      ...data,
      usedAt: null,
      createdAt: new Date()
    };
    this.refreshTokens.set(data.tokenHash, token);
    this.saveToDisk();
    return token;
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    return this.refreshTokens.get(tokenHash) || null;
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    for (const t of this.refreshTokens.values()) {
      if (t.id === id) {
        t.usedAt = new Date();
        break;
      }
    }
    this.saveToDisk();
  }

  async saveBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
    const codes = codeHashes.map((ch) => ({ userId, codeHash: ch, used: false }));
    this.backupCodes.set(userId, codes);
    this.saveToDisk();
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const codes = this.backupCodes.get(userId);
    if (!codes) return false;
    const match = codes.find((c) => c.codeHash === codeHash && !c.used);
    if (match) {
      match.used = true;
      this.saveToDisk();
      return true;
    }
    return false;
  }
}

