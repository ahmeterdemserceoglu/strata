import crypto from 'node:crypto';
import { loadConfig } from '@strata/config';

/**
 * Generates a 256-bit opaque cryptographically secure refresh token string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Computes SHA-256 hash of a refresh token to store in database
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a short-lived signed MFA ticket (valid for 5 minutes)
 */
export function createMfaTicket(userId: string, sessionId: string): string {
  const config = loadConfig();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = `${userId}:${sessionId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', config.MFA_ENCRYPTION_KEY).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies and unpacks an MFA ticket
 */
export function verifyMfaTicket(ticket: string): { userId: string; sessionId: string } | null {
  try {
    const config = loadConfig();
    const decoded = Buffer.from(ticket, 'base64url').toString('utf8');
    const [userId, sessionId, expStr, signature] = decoded.split(':');

    if (!userId || !sessionId || !expStr || !signature) return null;

    const expiresAt = Number(expStr);
    if (Date.now() > expiresAt) return null;

    const payload = `${userId}:${sessionId}:${expiresAt}`;
    const expected = crypto.createHmac('sha256', config.MFA_ENCRYPTION_KEY).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    return { userId, sessionId };
  } catch {
    return null;
  }
}
