# Strata — Dağıtık Gerçek Zamanlı İletişim Platformu

Strata; yüksek performanslı, yatay ölçeklenebilir ve düşük gecikmeli bir gerçek zamanlı ses, video ve mesajlaşma platformudur.

## Temel Özellikler
- **Sunucular (Guilds) ve Kanallar**: Metin kanalları, ses/video kanalları, duyuru kanalları ve thread'ler.
- **Doğrudan İletişim**: Birebir DM ve 10 kişiye kadar grup sohbetleri.
- **İzin ve Rol Sistemi**: 64-bit bitmask tabanlı esnek RBAC ve kanal/kategori overwrite hiyerarşisi.
- **Gerçek Zamanlı İletişim (Gateway)**: uWebSockets.js ile özel opcode protokolü, akıllı zombi tespiti ve olay replay buffer'lı RESUME mekanizması.
- **Ses & Video (SFU)**: LiveKit entegrasyonu, simulcast, WebRTC / Rust native ses motoru adaptörleri, VAD ve gürültü bastırma.
- **Dağıtık Depolama**: PostgreSQL (ilişkisel veriler) + PgBouncer, ScyllaDB (mesajlaşma), Redis Cluster (presence, pub/sub, rate limit, önbellek), MinIO / S3 (ekler).

## Mimari
```
                     ┌──────────────────┐
                     │   Load Balancer  │
                     └────────┬─────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
  ┌───────────────┐                       ┌───────────────┐
  │  Fastify API  │                       │   uWS Gateway │
  │ (Stateless)   │                       │   (Stateful)  │
  └───────┬───────┘                       └───────┬───────┘
          │ (REST Yazma)                          │ (WS Dinleme)
          │                                       │
          ├──────────────┬────────────────────────┤
          ▼              ▼                        ▼
  ┌──────────────┐ ┌──────────────┐        ┌──────────────┐
  │  PostgreSQL  │ │   ScyllaDB   │        │ Redis Cluster│
  │  (PgBouncer) │ │  (Mesajlar)  │        │  (Pub/Sub)   │
  └──────────────┘ └──────────────┘        └──────────────┘
          ▲                                       ▲
          │                                       │
          └──────────────┬────────────────────────┘
                         ▼
                  ┌──────────────┐
                  │BullMQ Worker │ (Embed, Arama, E-posta)
                  └──────────────┘
```

## Hızlı Başlangıç (Geliştirme Ortamı)

1. **Gereksinimler:** Node.js 22 LTS, pnpm, Docker.
2. **Geliştirme Anahtarları ve Ortam Kurulumu:**
   ```bash
   pnpm setup:dev
   ```
3. **Altyapı Servislerini Başlatma:**
   ```bash
   docker compose -f infra/docker-compose.dev.yml up -d
   ```
4. **Bağımlılıkları Yükleme ve Derleme:**
   ```bash
   pnpm install
   pnpm build
   ```
5. **Geliştirme Modunda Çalıştırma:**
   ```bash
   pnpm dev
   ```

Tüm yapılması gereken detaylar için lütfen [SENIN_YAPACAKLARIN.md](file:///c:/Projeler/kurmay-2/SENIN_YAPACAKLARIN.md) ve ilerleme takibi için [PROJE_DURUMU.md](file:///c:/Projeler/kurmay-2/PROJE_DURUMU.md) dokümanlarına bakınız.
