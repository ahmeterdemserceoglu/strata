import crypto from 'node:crypto';
import { loadConfig } from '@strata/config';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

/**
 * Encrypts a string using AES-256-GCM
 */
export function encryptMfaSecret(plainSecret: string): string {
  const config = loadConfig();
  const key = Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return formatted: iv:authTag:encrypted (in hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string using AES-256-GCM
 */
export function decryptMfaSecret(encryptedString: string): string {
  const config = loadConfig();
  const key = Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, dataHex] = encryptedString.split(':');

  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Geçersiz şifrelenmiş MFA verisi biçimi.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Base32 decode helper for TOTP secrets
 */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i).toUpperCase();
    if (char === '=') break;
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generates an RFC 6238 TOTP code for a secret and time
 */
export function generateTotpCode(secretBase32: string, timeMs: number = Date.now()): string {
  const key = base32Decode(secretBase32);
  const timeStep = Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1]! & 0xf;
  const codeInt =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const code = (codeInt % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
  return code;
}

/**
 * Verifies TOTP code with ±1 time window tolerance (prevents replay within window)
 */
export function verifyTotpCode(
  secretBase32: string,
  userCode: string,
  timeMs: number = Date.now()
): boolean {
  if (!userCode || userCode.length !== TOTP_DIGITS) return false;

  for (let window = -1; window <= 1; window++) {
    const checkTime = timeMs + window * TOTP_STEP_SECONDS * 1000;
    const expected = generateTotpCode(secretBase32, checkTime);
    if (crypto.timingSafeEqual(Buffer.from(userCode), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

/**
 * Generates 10 backup codes formatted like `xxxx-xxxx` and their SHA-256 hashes
 */
export function generateBackupCodes(): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(4).toString('hex');
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    const hash = crypto.createHash('sha256').update(formatted).digest('hex');

    plainCodes.push(formatted);
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}
