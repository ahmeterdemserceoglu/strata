import crypto from 'node:crypto';
import { generateId } from '@strata/snowflake';
import { loadConfig } from '@strata/config';
import type { RegisterDto, LoginDto } from '@strata/protocol';
import type { IAuthStore, UserEntity } from './auth-store.js';
import { hashPassword, verifyPassword } from '../crypto/password.js';
import { signAccessToken } from '../crypto/jwt.js';
import { generateRefreshToken, hashToken, createMfaTicket, verifyMfaTicket } from '../crypto/tokens.js';
import {
  encryptMfaSecret,
  decryptMfaSecret,
  verifyTotpCode,
  generateBackupCodes
} from '../crypto/totp.js';

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    email: string;
    avatarHash: string | null;
    mfaEnabled: boolean;
  };
}

export class AuthService {
  constructor(private readonly store: IAuthStore) {}

  public async register(
    dto: RegisterDto,
    clientType: 'web' | 'desktop' | 'mobile' = 'web',
    deviceName?: string,
    ip?: string,
    userAgent?: string
  ): Promise<AuthTokensResult> {
    const existingEmail = await this.store.findUserByEmail(dto.email);
    if (existingEmail) {
      throw new Error('Bu e-posta adresi zaten kullanımda.');
    }

    const existingUsername = await this.store.findUserByUsername(dto.username);
    if (existingUsername) {
      throw new Error('Bu kullanıcı adı zaten alınmış.');
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = generateId();

    const user = await this.store.createUser({
      id: userId,
      username: dto.username,
      displayName: dto.displayName || null,
      email: dto.email,
      emailVerified: false,
      passwordHash,
      avatarHash: null,
      flags: 0,
      mfaEnabled: false,
      mfaSecretEnc: null,
      tokenVersion: 1
    });

    return this.createSessionAndTokens(user, clientType, deviceName, ip, userAgent);
  }

  public async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string
  ): Promise<
    | { mfaRequired: false; tokens: AuthTokensResult }
    | { mfaRequired: true; mfaTicket: string }
  > {
    const user = dto.login.includes('@')
      ? await this.store.findUserByEmail(dto.login)
      : await this.store.findUserByUsername(dto.login);

    if (!user || !user.passwordHash) {
      throw new Error('Geçersiz kullanıcı adı veya şifre.');
    }

    const validPassword = await verifyPassword(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new Error('Geçersiz kullanıcı adı veya şifre.');
    }

    // Create session
    const sessionId = generateId();
    await this.store.createSession({
      id: sessionId,
      userId: user.id,
      clientType: dto.clientType,
      deviceName: dto.deviceName || null,
      ip: ip || null,
      userAgent: userAgent || null
    });

    if (user.mfaEnabled) {
      const ticket = createMfaTicket(user.id, sessionId);
      return { mfaRequired: true, mfaTicket: ticket };
    }

    const tokens = await this.issueTokensForSession(user, sessionId);
    return { mfaRequired: false, tokens };
  }

  public async verifyMfaTotp(
    ticket: string,
    code: string
  ): Promise<AuthTokensResult> {
    const unpacked = verifyMfaTicket(ticket);
    if (!unpacked) {
      throw new Error('Geçersiz veya süresi dolmuş MFA bileti.');
    }

    const user = await this.store.findUserById(unpacked.userId);
    if (!user || !user.mfaSecretEnc) {
      throw new Error('Kullanıcı bulunamadı veya MFA kurulu değil.');
    }

    const session = await this.store.findSessionById(unpacked.sessionId);
    if (!session || session.revokedAt) {
      throw new Error('Oturum geçersiz kılındı.');
    }

    const plainSecret = decryptMfaSecret(user.mfaSecretEnc);
    let valid = verifyTotpCode(plainSecret, code);

    if (!valid) {
      // Check backup codes
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      valid = await this.store.consumeBackupCode(user.id, codeHash);
    }

    if (!valid) {
      throw new Error('Geçersiz doğrulama kodu.');
    }

    return this.issueTokensForSession(user, session.id);
  }

  public async refreshToken(rawRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  }> {
    const hashed = hashToken(rawRefreshToken);
    const tokenRecord = await this.store.findRefreshTokenByHash(hashed);

    if (!tokenRecord) {
      throw new Error('Geçersiz yenileme belirteci.');
    }

    // Reuse detection! If already used, revoke session immediately!
    if (tokenRecord.usedAt !== null) {
      await this.store.revokeSession(tokenRecord.sessionId);
      throw new Error('Yenileme belirteci daha önce kullanılmış. Güvenlik nedeniyle oturum sonlandırıldı.');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new Error('Yenileme belirtecinin süresi dolmuş.');
    }

    const session = await this.store.findSessionById(tokenRecord.sessionId);
    if (!session || session.revokedAt) {
      throw new Error('Oturum kapatılmış.');
    }

    const user = await this.store.findUserById(tokenRecord.userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    // Mark current token as used
    await this.store.markRefreshTokenUsed(tokenRecord.id);

    // Rotate: Issue new refresh token
    const config = loadConfig();
    const newRawRefreshToken = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await this.store.saveRefreshToken({
      tokenHash: hashToken(newRawRefreshToken),
      sessionId: session.id,
      userId: user.id,
      expiresAt: newExpiresAt
    });

    const { token: newAccessToken, expiresInSeconds } = await signAccessToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresInSeconds
    };
  }

  public async logout(sessionId: string): Promise<void> {
    await this.store.revokeSession(sessionId);
  }

  public async setupMfa(userId: string): Promise<{ secretBase32: string; backupCodes: string[] }> {
    const user = await this.store.findUserById(userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    const secretBytes = crypto.randomBytes(20);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secretBase32 = '';
    for (let i = 0; i < secretBytes.length; i++) {
      secretBase32 += alphabet[secretBytes[i]! % 32];
    }

    const { plainCodes, hashedCodes } = generateBackupCodes();
    const encryptedSecret = encryptMfaSecret(secretBase32);

    await this.store.updateUser(userId, { mfaSecretEnc: encryptedSecret });
    await this.store.saveBackupCodes(userId, hashedCodes);

    return { secretBase32, backupCodes: plainCodes };
  }

  public async enableMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.store.findUserById(userId);
    if (!user || !user.mfaSecretEnc) throw new Error('MFA henüz başlatılmamış.');

    const plainSecret = decryptMfaSecret(user.mfaSecretEnc);
    const valid = verifyTotpCode(plainSecret, code);

    if (!valid) {
      throw new Error('Kod doğrulanamadı. Lütfen tekrar deneyin.');
    }

    await this.store.updateUser(userId, { mfaEnabled: true });
    return true;
  }

  public async disableMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.store.findUserById(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecretEnc) {
      throw new Error('MFA aktif değil.');
    }

    const plainSecret = decryptMfaSecret(user.mfaSecretEnc);
    const valid = verifyTotpCode(plainSecret, code);

    if (!valid) {
      throw new Error('Geçersiz onay kodu.');
    }

    await this.store.updateUser(userId, {
      mfaEnabled: false,
      mfaSecretEnc: null
    });
    return true;
  }

  private async createSessionAndTokens(
    user: UserEntity,
    clientType: 'web' | 'desktop' | 'mobile',
    deviceName?: string,
    ip?: string,
    userAgent?: string
  ): Promise<AuthTokensResult> {
    const sessionId = generateId();
    await this.store.createSession({
      id: sessionId,
      userId: user.id,
      clientType,
      deviceName: deviceName || null,
      ip: ip || null,
      userAgent: userAgent || null
    });

    return this.issueTokensForSession(user, sessionId);
  }

  private async issueTokensForSession(user: UserEntity, sessionId: string): Promise<AuthTokensResult> {
    const config = loadConfig();
    const rawRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await this.store.saveRefreshToken({
      tokenHash: hashToken(rawRefreshToken),
      sessionId,
      userId: user.id,
      expiresAt
    });

    const { token: accessToken, expiresInSeconds } = await signAccessToken({
      userId: user.id,
      sessionId,
      tokenVersion: user.tokenVersion
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSeconds,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarHash: user.avatarHash,
        mfaEnabled: user.mfaEnabled
      }
    };
  }
}
