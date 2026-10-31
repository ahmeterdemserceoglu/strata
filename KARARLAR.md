# Mimari Kararlar ve Gerekçeler (Architecture Decision Records - ADR)

Bu doküman, projede alınan bağlayıcı mimari kararları, teknik kısıtları ve uygulanan alternatifleri belgeler.

---

### ADR-001: Marka ve İsim Seçimi ("Strata")
- **Tarih:** 2026-10-30
- **Durum:** Kabul edildi
- **Karar:** Proje adı **Strata** olarak belirlendi.
- **Gerekçe:** Ürün Discord'a işlevsel alternatif sunmakla birlikte tamamen özgün bir görsel ve kavramsal kimlik taşımalıdır. "Strata" (katmanlar), hem dağıtık katmanlı mimariyi hem de platformun ses, metin, sunucu ve topluluk katmanlarını temsil eder. Renk paleti Discord'un "blurple" renginden tamamen farklı olarak Electric Indigo ve Obsidian Cyan tonlarında tasarlanmıştır.

---

### ADR-002: Monorepo Araç Zinciri (pnpm + Turborepo)
- **Tarih:** 2026-10-30
- **Durum:** Kabul edildi
- **Karar:** Paket yönetimi için pnpm workspaces, görev yürütme ve önbellekleme için Turborepo seçildi.
- **Gerekçe:** Katı sembolik linkleme (phantom dependency engelleme), paylaşılan TypeScript tipleri ve hızlı artımlı (incremental) derleme yeteneği sağlar.

---

### ADR-003: WebSocket ve REST Ayrımı ("REST ile Yaz, WebSocket ile Dinle")
- **Tarih:** 2026-10-30
- **Durum:** Kabul edildi
- **Karar:** Yazma işlemlerinin tamamı stateless Fastify REST API üzerinden, gerçek zamanlı bildirimler ise stateful uWebSockets.js Gateway üzerinden gerçekleştirilir.
- **Gerekçe:**
  1. REST katmanında standart HTTP cache, idempotency, rate-limiting, WAF ve yük dengeleme kuralları kolayca uygulanır.
  2. Gateway katmanı yalnızca bağlantı durumunu (state) yönetir ve olayları istemcilere dağıtır (fan-out). Bu sayede Gateway çökse bile REST API çalışmaya devam eder ve istemciler replay buffer ile olay kaybı olmadan RESUME yapabilir.

---

### ADR-004: Snowflake ID Tasarımı (Epoch: 2025-01-01T00:00:00Z)
- **Tarih:** 2026-10-30
- **Durum:** Kabul edildi
- **Karar:** 64-bit Snowflake ID (42 bit zaman damgası, 10 bit worker ID, 12 bit sequence) kullanılacaktır.
- **Gerekçe:** Veritabanına yazmadan önce istemci veya API katmanında sıralı, benzersiz ve zamana bağlı ID'ler üretilebilmesini sağlar. Zaman damgası çıkarımı ve sayfalama (`before`/`after`) Snowflake ID üzerinden O(1) maliyetle yapılır.
