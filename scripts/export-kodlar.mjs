// Projeyi tek bir metin dosyasına döker: proje_kodlari.txt
// Kullanım (kök dizinde):  node scripts/export-kodlar.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'proje_kodlari.txt');

// Atlanacak klasörler
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'target', '.turbo', '.git', '.vite',
  'coverage', '.next', 'gen', 'icons', '.idea', '.vscode'
]);

// Atlanacak dosyalar (gizli anahtarlar, kilit dosyaları, çıktının kendisi)
const SKIP_FILES = new Set([
  'proje_kodlari.txt', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
  'Cargo.lock', '.env', '.env.local', '.DS_Store'
]);

// Sadece bu uzantılar (metin dosyaları) alınır
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml',
  '.toml', '.rs', '.html', '.css', '.sql', '.txt', '.sh', '.ps1', '.example', ''
]);

const MAX_SIZE = 300 * 1024; // 300 KB üstü dosyaları atla

const list = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  // Önce dosyalar, sonra klasörler (kök dosyalar listenin başında olsun)
  for (const e of entries.filter(e => e.isFile())) {
    if (SKIP_FILES.has(e.name)) continue;
    const ext = e.name.startsWith('.env.') ? '.example' : path.extname(e.name).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const full = path.join(dir, e.name);
    if (fs.statSync(full).size > MAX_SIZE) continue;
    list.push(full);
  }
  for (const e of entries.filter(e => e.isDirectory())) {
    if (SKIP_DIRS.has(e.name)) continue;
    walk(path.join(dir, e.name));
  }
}

walk(ROOT);

const rel = f => path.relative(ROOT, f).split(path.sep).join('\\');

let txt = '##### DOSYA LISTESI #####\n' + list.map(rel).join('\n') + '\n\n';
for (const f of list) {
  const name = rel(f);
  const body = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  txt += `===== FILE: ${name} =====\n${body}\n===== END: ${name} =====\n\n`;
}

fs.writeFileSync(OUT, txt, 'utf8');
console.log(`✅ ${list.length} dosya yazıldı -> ${OUT} (${(Buffer.byteLength(txt) / 1024).toFixed(1)} KB)`);
