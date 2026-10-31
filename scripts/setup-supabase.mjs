import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

const SUPABASE_PROJECT_REF = 'ddjqmymoiukmiubljjpg';
const SUPABASE_HOST = 'aws-1-eu-west-3.pooler.supabase.com';

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log('====================================================');
  console.log('🚀 STRATA - SUPABASE OTOMATİK KURULUM SİHİRBAZI');
  console.log(`📡 Proje: postgres.${SUPABASE_PROJECT_REF} (${SUPABASE_HOST})`);
  console.log('====================================================\n');

  const rawPass = process.argv[2] || (await askQuestion('🔑 Supabase veritabanı şifreni gir ve Enter\'a bas: '));
  if (!rawPass) {
    console.error('❌ Şifre boş olamaz! Lütfen tekrar çalıştırın.');
    process.exit(1);
  }

  const encodedPass = encodeURIComponent(rawPass);
  const databaseUrl = `postgresql://postgres.${SUPABASE_PROJECT_REF}:${encodedPass}@${SUPABASE_HOST}:6543/postgres?pgbouncer=true`;
  const directUrl = `postgresql://postgres.${SUPABASE_PROJECT_REF}:${encodedPass}@${SUPABASE_HOST}:5432/postgres`;

  // 1. Ed25519 JWT Keypair & MFA Key üret
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const formattedPrivateKey = privateKey.replace(/\r?\n/g, '\\n');
  const formattedPublicKey = publicKey.replace(/\r?\n/g, '\\n');
  const mfaEncryptionKey = crypto.randomBytes(32).toString('hex');

  let envContent = fs.existsSync(envExamplePath)
    ? fs.readFileSync(envExamplePath, 'utf8')
    : '';

  envContent = envContent.replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL="${databaseUrl}"\nDIRECT_URL="${directUrl}"`
  );
  envContent = envContent.replace('JWT_PRIVATE_KEY=""', `JWT_PRIVATE_KEY="${formattedPrivateKey}"`);
  envContent = envContent.replace('JWT_PUBLIC_KEY=""', `JWT_PUBLIC_KEY="${formattedPublicKey}"`);
  envContent = envContent.replace('MFA_ENCRYPTION_KEY=""', `MFA_ENCRYPTION_KEY="${mfaEncryptionKey}"`);

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ .env dosyası Supabase bağlantı bilgilerin ve güvenlik anahtarlarınla oluşturuldu!');

  // 2. Supabase veritabanına bağlanıp tabloları oluştur
  console.log('⏳ Supabase PostgreSQL sunucusuna bağlanılıyor ve tablolar oluşturuluyor...');
  try {
    const dbPkgRequire = createRequire(path.join(rootDir, 'packages', 'db', 'package.json'));
    const pg = dbPkgRequire('pg');
    const pool = new pg.Pool({
      connectionString: directUrl,
      ssl: { rejectUnauthorized: false }
    });

    const sql = `
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
    `;

    await pool.query(sql);
    await pool.end();
    console.log('🎉 SUPABASE KURULUMU TAMAMLANDI! Tüm tablolar (users, auth_sessions, guilds, channels, messages, invites) başarıyla oluşturuldu.');
    console.log('👉 Şimdi "pnpm dev" komutuyla sistemi başlatabilirsin!');
  } catch (err) {
    console.error('❌ Supabase bağlantısı sırasında hata oluştu (şifreni kontrol et):', err.message || err);
    process.exit(1);
  }
}

main();

