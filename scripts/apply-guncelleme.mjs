import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const isWatch = process.argv.includes('--watch');

function findUpdateFile() {
  const localFile = path.join(ROOT, 'guncelleme.txt');
  if (fs.existsSync(localFile)) return localFile;

  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (fs.existsSync(downloadsDir)) {
    const candidates = fs
      .readdirSync(downloadsDir)
      .filter((name) => /^guncelleme(\s*\(\d+\))?\.txt$/i.test(name))
      .map((name) => {
        const full = path.join(downloadsDir, name);
        return { full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (candidates.length > 0) return candidates[0].full;
  }
  return null;
}

function applyUpdate(updateFilePath) {
  const raw = fs.readFileSync(updateFilePath, 'utf8').replace(/\r\n/g, '\n');
  const fileRegex = /^===== FILE:\s*(.+?)\s*=====$/gm;
  const matches = [...raw.matchAll(fileRegex)];

  if (matches.length === 0) return false;

  console.log(`\n📦 Paket okunuyor: ${updateFilePath}`);
  let updatedCount = 0;

  for (let i = 0; i < matches.length; i++) {
    const relPath = matches[i][1].trim().replace(/\\/g, '/');
    const startIdx = matches[i].index + matches[i][0].length + 1;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const content = raw.slice(startIdx, endIdx).replace(/\n$/, '') + '\n';

    const targetPath = path.resolve(ROOT, relPath);
    if (!targetPath.startsWith(ROOT)) continue;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(`  ✅ Güncellendi: ${relPath}`);
    updatedCount++;
  }

  try { fs.unlinkSync(updateFilePath); } catch {}

  const exportScript = path.join(ROOT, 'scripts', 'export-kodlar.mjs');
  if (fs.existsSync(exportScript)) {
    try {
      execSync(`node "${exportScript}"`, { cwd: ROOT, stdio: 'inherit' });
    } catch {}
  }

  console.log(`\n🎉 Toplam ${updatedCount} dosya başarıyla güncellendi!`);
  return true;
}

if (isWatch) {
  console.log('👀 Canlı nöbetçi aktif! Sohbetten guncelleme.txt indirdiğin an otomatik uygulanacak...');
  setInterval(() => {
    try {
      const f = findUpdateFile();
      if (f) applyUpdate(f);
    } catch {}
  }, 1500);
} else {
  const updateFile = findUpdateFile();
  if (!updateFile) {
    console.log('ℹ️ Henüz guncelleme.txt bulunamadı.');
    process.exit(0);
  }
  applyUpdate(updateFile);
}
