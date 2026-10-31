# PROJE DURUMU — Strata Geliştirme Takibi

Bu doküman, geliştirme fazlarının anlık durumunu, çalıştırılma biçimlerini, geçen testleri ve bilinen kısıtları belgeler.

| Faz | Başlık | Durum | Test Durumu | Notlar |
|---|---|---|---|---|
| **Faz 0** | Temel Altyapı, Monorepo, Snowflake, Protokol | 🟢 Tamamlandı | 11/11 Geçti | Monorepo (pnpm+Turbo), TS Strict, docker-compose, setup:dev, Snowflake (testli), Protocol (Zod) hazır. |
| **Faz 1** | Kimlik Doğrulama, Oturum, 2FA, OAuth, Rate Limiting | 🟢 Tamamlandı | 8/8 Geçti (Toplam: 19/19) | Fastify REST Auth, Argon2id, Ed25519 JWKS, TOTP RFC 6238, token rotasyonu, reuse tespiti, rate limiter test edildi. |
| **Faz 2** | Gateway Çekirdeği, uWS, Heartbeat, Resume, Replay | 🟢 Tamamlandı | 2/2 Geçti (Toplam: 21/21) | HELLO/IDENTIFY/READY, heartbeat/ACK, zombi tespiti, RESUME replay buffer ile sıfır veri kaybı doğrulandı. |
| **Faz 3** | Guild, Kanal, Rol ve 64-bit İzin Sistemi | 🟢 Tamamlandı | 8/8 Geçti (Toplam: 29/29) | 64-bit RBAC algoritması, overwrite'lar, rol hiyerarşisi, davetler, Gateway izin filtresi test edildi. |
| **Faz 4** | Mesajlaşma Motoru, ScyllaDB, Markdown AST, Worker | 🟢 Tamamlandı | 10/10 Geçti (Toplam: 39/39) | Mesaj CRUD, sayfalama, Nonce idempotency (çift gönderim koruması), Markdown AST XSS kalkanı, SSRF korumalı embed, slowmode test edildi. |
| **Faz 5** | Web İstemcisi & Tasarım Sistemi | ⚪ Başlanmadı | - | Next.js 15, 3 sütunlu UI, sanallaştırılmış liste, ses efektleri. |
| **Faz 6** | İlişkiler, DM, Grup DM, Presence, Bildirimler | ⚪ Başlanmadı | - | Arkadaşlık, çoklu cihaz presence, DM kanalları. |
| **Faz 7** | Ses ve Görüntü (LiveKit), WebRTC, VAD | ⚪ Başlanmadı | - | LiveKit SFU, VoiceEngine, VAD, PTT, ekran paylaşımı. |
| **Faz 8** | Masaüstü İstemcisi (Tauri 2) | ⚪ Başlanmadı | - | Tauri 2 kabuk, native keyring, WebRTC uyumluluk ekranı. |
| **Faz 9** | Mobil İstemci (Expo / React Native) | ⚪ Başlanmadı | - | Expo Router, FlashList, arka plan ses. |
| **Faz 10** | Arama, Moderasyon, Gizlilik & Güvenlik Taraması | ⚪ Başlanmadı | - | Meilisearch indeksleme, spam sezgileri, ASVS raporu. |
| **Faz 11** | Üretime Hazırlık, Helm, Yük Testleri, Runbook'lar | ⚪ Başlanmadı | - | K8s Helm chart, k6 yük testi, kaos testi, SLO doğrulaması. |

---

## Nasıl Çalıştırılır?
1. Bağımlılıkları kur: `pnpm install`
2. Yerel anahtarları üret: `pnpm setup:dev`
3. Altyapıyı başlat: `docker compose -f infra/docker-compose.dev.yml up -d`
4. Derle ve test et: `pnpm build && pnpm test`
5. Servisleri başlat: `pnpm dev`
