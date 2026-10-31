import * as jose from 'jose';
import { loadConfig } from '@strata/config';

export interface TokenClaims {
  sub: string;       // userId
  sid: string;       // sessionId
  ver: number;       // token_version
  aud: string;       // 'strata-client'
  iss: string;       // 'strata-api'
}

let privateKeyObj: jose.KeyLike | Uint8Array | null = null;
let publicKeyObj: jose.KeyLike | Uint8Array | null = null;

async function getKeys() {
  if (privateKeyObj && publicKeyObj) {
    return { privateKey: privateKeyObj, publicKey: publicKeyObj };
  }

  const config = loadConfig();
  const privPem = config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const pubPem = config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

  privateKeyObj = await jose.importPKCS8(privPem, 'EdDSA');
  publicKeyObj = await jose.importSPKI(pubPem, 'EdDSA');

  return { privateKey: privateKeyObj, publicKey: publicKeyObj };
}

export async function signAccessToken(payload: {
  userId: string;
  sessionId: string;
  tokenVersion: number;
}): Promise<{ token: string; expiresInSeconds: number }> {
  const config = loadConfig();
  const { privateKey } = await getKeys();
  const expiresInSeconds = config.ACCESS_TOKEN_EXPIRES_MINUTES * 60;

  const jwt = await new jose.SignJWT({
    sub: payload.userId,
    sid: payload.sessionId,
    ver: payload.tokenVersion
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: config.JWT_KID })
    .setIssuedAt()
    .setIssuer('strata-api')
    .setAudience('strata-client')
    .setExpirationTime(`${config.ACCESS_TOKEN_EXPIRES_MINUTES}m`)
    .sign(privateKey);

  return { token: jwt, expiresInSeconds };
}

export async function verifyAccessToken(token: string): Promise<TokenClaims | null> {
  try {
    const { publicKey } = await getKeys();
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: 'strata-api',
      audience: 'strata-client'
    });

    if (
      typeof payload.sub !== 'string' ||
      typeof payload['sid'] !== 'string' ||
      typeof payload['ver'] !== 'number'
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      sid: payload['sid'] as string,
      ver: payload['ver'] as number,
      aud: 'strata-client',
      iss: 'strata-api'
    };
  } catch {
    return null;
  }
}

export async function getJwks() {
  const config = loadConfig();
  const { publicKey } = await getKeys();
  const jwk = await jose.exportJWK(publicKey);

  return {
    keys: [
      {
        ...jwk,
        kid: config.JWT_KID,
        alg: 'EdDSA',
        use: 'sig'
      }
    ]
  };
}
