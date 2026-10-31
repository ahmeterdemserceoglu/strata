import path from 'node:path';
import { loadConfig } from '@strata/config';
import { getPgPool, MIGRATION_001_AUTH_SQL } from '@strata/db';
import { buildServer } from './server.js';
import { realtimeHub } from './realtime.js';
import { InMemoryAuthStore, PostgresAuthStore, type IAuthStore } from './services/auth-store.js';

const config = loadConfig();

async function start() {
  try {
    let authStore: IAuthStore;
    const isSupabaseConfigured =
      Boolean(config.DATABASE_URL) &&
      !config.DATABASE_URL.includes('localhost:5432/strata_db');

    if (isSupabaseConfigured) {
      try {
        const pool = getPgPool(config.DATABASE_URL);
        await pool.query(MIGRATION_001_AUTH_SQL);
        authStore = new PostgresAuthStore(pool);
        console.log('🗄️ [Strata API] Supabase PostgreSQL veritabani aktif!');
      } catch (dbErr) {
        console.error('⚠️ Supabase baglantisi basarisiz oldu, yerel yedek depoya geciliyor:', dbErr);
        const dataDir = path.resolve(process.cwd(), '.data');
        authStore = new InMemoryAuthStore({
          persistFilePath: path.join(dataDir, 'auth-store.json')
        });
      }
    } else {
      const dataDir = path.resolve(process.cwd(), '.data');
      authStore = new InMemoryAuthStore({
        persistFilePath: path.join(dataDir, 'auth-store.json')
      });
      console.log(`💾 [Strata API] Yerel kalici veri deposu aktif: ${dataDir}`);
    }

    const server = buildServer(authStore);
    const port = Number(process.env.PORT) || config.API_PORT;

    // Attach WebSocket Realtime Hub on the exact same HTTP Server (Render Free Tier friendly!)
    realtimeHub.attach(server.server);

    await server.listen({
      port,
      host: '0.0.0.0'
    });
    console.log(`🚀 Strata REST API + Canli WebSocket calisiyor (Port: ${port})`);
    console.log(`📖 Saglik kontrolu: ${config.API_PUBLIC_URL}/health/live`);
  } catch (err) {
    console.error('API sunucusu baslatilamadi:', err);
    process.exit(1);
  }
}

void start();

