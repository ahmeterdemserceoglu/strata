import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env dosyasi bulunamadi! Once `pnpm setup:supabase` calistirin.');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');
const wantedKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_KID',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
  'MFA_ENCRYPTION_KEY'
];

console.log('\n============================================================');
console.log('🚀 RENDER.COM -> "Add from .env" KISMINA BUNU YAPIŞTIRIN:');
console.log('============================================================\n');
console.log('NODE_ENV=production');

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if (key === 'NODE_ENV') continue;
  if (wantedKeys.includes(key)) {
    // Strip outer quotes for clean Render .env import
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    console.log(`${key}=${val}`);
  }
}

console.log('\n============================================================\n');
