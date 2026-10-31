import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { generateTotpCode } from '../src/crypto/totp.js';
import { InMemoryAuthStore } from '../src/services/auth-store.js';

describe('Auth Service & REST API Integration Tests', () => {
  let app: FastifyInstance;
  let authStore: InMemoryAuthStore;

  beforeAll(() => {
    authStore = new InMemoryAuthStore();
    app = buildServer(authStore);
  });

  it('GET /health/live returns ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/live'
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /.well-known/jwks.json returns Ed25519 public key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/jwks.json'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keys).toBeDefined();
    expect(body.keys[0].kty).toBe('OKP');
    expect(body.keys[0].crv).toBe('Ed25519');
  });

  it('POST /api/v1/auth/register creates user and returns access + refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'x-client-type': 'desktop'
      },
      payload: {
        username: 'strata_tester',
        email: 'tester@strata.chat',
        password: 'SuperSecurePassword123!',
        displayName: 'Strata Tester'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.username).toBe('strata_tester');
    expect(body.user.email).toBe('tester@strata.chat');
    expect(body.user.mfaEnabled).toBe(false);
  });

  it('POST /api/v1/auth/register rejects duplicate email and username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'strata_tester',
        email: 'tester@strata.chat',
        password: 'SuperSecurePassword123!'
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/auth/login succeeds with correct password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        login: 'tester@strata.chat',
        password: 'SuperSecurePassword123!',
        clientType: 'desktop'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.mfaRequired).toBeUndefined();
  });

  it('POST /api/v1/auth/login fails with invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        login: 'tester@strata.chat',
        password: 'WrongPassword!',
        clientType: 'web'
      }
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/refresh rotates token and detects reuse', async () => {
    // 1. Initial login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        login: 'tester@strata.chat',
        password: 'SuperSecurePassword123!',
        clientType: 'desktop'
      }
    });
    const { refreshToken: firstRefreshToken } = loginRes.json();

    // 2. Perform refresh
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: firstRefreshToken
      }
    });

    expect(refreshRes.statusCode).toBe(200);
    const { accessToken: newAccessToken, refreshToken: secondRefreshToken } = refreshRes.json();
    expect(newAccessToken).toBeDefined();
    expect(secondRefreshToken).toBeDefined();
    expect(secondRefreshToken).not.toBe(firstRefreshToken);

    // 3. REUSE DETECTION: Re-submitting the old `firstRefreshToken` must be REJECTED!
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: firstRefreshToken
      }
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().message).toContain('daha önce kullanılmış');
  });

  it('TOTP 2FA setup, enable, login with ticket, and backup code flow', async () => {
    // 1. Login to get access token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        login: 'tester@strata.chat',
        password: 'SuperSecurePassword123!',
        clientType: 'desktop'
      }
    });
    const { accessToken } = loginRes.json();

    // 2. Request MFA Setup
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/@me/mfa/totp/setup',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret, backupCodes } = setupRes.json();
    expect(secret).toBeDefined();
    expect(backupCodes.length).toBe(10);

    // 3. Enable MFA using valid TOTP code
    const validCode = generateTotpCode(secret);
    const enableRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/@me/mfa/totp/enable',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      payload: {
        code: validCode
      }
    });
    expect(enableRes.statusCode).toBe(200);

    // 4. Login now requires MFA ticket!
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        login: 'tester@strata.chat',
        password: 'SuperSecurePassword123!'
      }
    });
    expect(secondLogin.statusCode).toBe(200);
    const { mfaRequired, mfaTicket } = secondLogin.json();
    expect(mfaRequired).toBe(true);
    expect(mfaTicket).toBeDefined();

    // 5. Verify using a single-use backup code
    const firstBackupCode = backupCodes[0];
    const mfaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/totp',
      payload: {
        ticket: mfaTicket,
        code: firstBackupCode
      }
    });
    expect(mfaRes.statusCode).toBe(200);
    expect(mfaRes.json().accessToken).toBeDefined();
    expect(mfaRes.json().user.mfaEnabled).toBe(true);
  });
});
