import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * OWASP Recommended parameters for Argon2id:
 * - Algorithm: Argon2id
 * - Memory: 64 MB (65536 KiB)
 * - Iterations (Time Cost): 3
 * - Parallelism: 4
 */
export async function hashPassword(plainText: string): Promise<string> {
  return hash(plainText, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    outputLen: 32,
    parallelism: 4
  });
}

export async function verifyPassword(hashString: string, plainText: string): Promise<boolean> {
  try {
    return await verify(hashString, plainText);
  } catch {
    return false;
  }
}
