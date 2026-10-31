import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

console.log('⚡ Strata Geliştirme Ortamı Anahtarları Üretiliyor (pnpm setup:dev)...');

// 1. Ed25519 JWT Keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Single-line or escaped PEM for env
const formattedPrivateKey = privateKey.replace(/\r?\n/g, '\\n');
const formattedPublicKey = publicKey.replace(/\r?\n/g, '\\n');

// 2. AES-256 Key for MFA TOTP encryption (32 bytes hex)
const mfaEncryptionKey = crypto.randomBytes(32).toString('hex');

// 3. LiveKit Dev credentials
const livekitApiKey = 'devkey_' + crypto.randomBytes(4).toString('hex');
const livekitApiSecret = crypto.randomBytes(16).toString('hex');

// Read .env.example as template
let envContent = fs.readFileSync(envExamplePath, 'utf8');

// Replace generated values
envContent = envContent.replace(
  'JWT_PRIVATE_KEY=""',
  `JWT_PRIVATE_KEY="${formattedPrivateKey}"`
);
envContent = envContent.replace(
  'JWT_PUBLIC_KEY=""',
  `JWT_PUBLIC_KEY="${formattedPublicKey}"`
);
envContent = envContent.replace(
  'MFA_ENCRYPTION_KEY=""',
  `MFA_ENCRYPTION_KEY="${mfaEncryptionKey}"`
);
envContent = envContent.replace(
  'LIVEKIT_API_KEY=devkey',
  `LIVEKIT_API_KEY=${livekitApiKey}`
);
envContent = envContent.replace(
  'LIVEKIT_API_SECRET=secret',
  `LIVEKIT_API_SECRET=${livekitApiSecret}`
);

// If .env already exists, preserve it or create backup
if (fs.existsSync(envPath)) {
  const backupPath = path.join(rootDir, '.env.backup-' + Date.now());
  fs.copyFileSync(envPath, backupPath);
  console.log(`ℹ️ Mevcut .env dosyası yedeklendi: ${path.basename(backupPath)}`);
}

fs.writeFileSync(envPath, envContent, 'utf8');

// Ensure assets directories exist
fs.mkdirSync(path.join(rootDir, 'assets/sounds'), { recursive: true });
fs.mkdirSync(path.join(rootDir, 'assets/brand'), { recursive: true });

// Create sounds.json manifest
const soundsManifestPath = path.join(rootDir, 'assets/sounds/sounds.json');
if (!fs.existsSync(soundsManifestPath)) {
  const soundsManifest = {
    version: '1.0.0',
    description: 'Strata ses efektleri manifestosu. Dosyalar assets/sounds altında yer alır.',
    sounds: [
      { id: 'voice_join', file: 'voice_join.ogg', defaultVolume: 0.8, loop: false, description: 'Ses kanalına bağlanma' },
      { id: 'voice_leave', file: 'voice_leave.ogg', defaultVolume: 0.8, loop: false, description: 'Ses kanalından ayrılma' },
      { id: 'user_join', file: 'user_join.ogg', defaultVolume: 0.7, loop: false, description: 'Kullanıcı katıldı' },
      { id: 'user_leave', file: 'user_leave.ogg', defaultVolume: 0.7, loop: false, description: 'Kullanıcı ayrıldı' },
      { id: 'mute', file: 'mute.ogg', defaultVolume: 0.6, loop: false, description: 'Mikrofon susturuldu' },
      { id: 'unmute', file: 'unmute.ogg', defaultVolume: 0.6, loop: false, description: 'Susturma açıldı' },
      { id: 'deafen', file: 'deafen.ogg', defaultVolume: 0.6, loop: false, description: 'Kulaklık kapatıldı' },
      { id: 'undeafen', file: 'undeafen.ogg', defaultVolume: 0.6, loop: false, description: 'Kulaklık açıldı' },
      { id: 'message', file: 'message.ogg', defaultVolume: 0.5, loop: false, description: 'Yeni mesaj bildirimi' },
      { id: 'mention', file: 'mention.ogg', defaultVolume: 0.8, loop: false, description: 'Etiketleme bildirimi' },
      { id: 'incoming_call', file: 'incoming_call.ogg', defaultVolume: 0.9, loop: true, description: 'Gelen çağrı sesi' },
      { id: 'outgoing_call', file: 'outgoing_call.ogg', defaultVolume: 0.8, loop: true, description: 'Giden arama sesi' },
      { id: 'stream_start', file: 'stream_start.ogg', defaultVolume: 0.7, loop: false, description: 'Yayın başladı' },
      { id: 'stream_stop', file: 'stream_stop.ogg', defaultVolume: 0.7, loop: false, description: 'Yayın durdu' },
      { id: 'ptt_on', file: 'ptt_on.ogg', defaultVolume: 0.4, loop: false, description: 'PTT basıldı' },
      { id: 'ptt_off', file: 'ptt_off.ogg', defaultVolume: 0.4, loop: false, description: 'PTT bırakıldı' },
      { id: 'disconnect', file: 'disconnect.ogg', defaultVolume: 0.8, loop: false, description: 'Bağlantı kesildi' }
    ]
  };
  fs.writeFileSync(soundsManifestPath, JSON.stringify(soundsManifest, null, 2), 'utf8');
}

console.log('✅ .env dosyası başarıyla oluşturuldu ve geliştirme anahtarları yazıldı!');
console.log('✅ assets/sounds/sounds.json manifestosu hazırlandı.');
