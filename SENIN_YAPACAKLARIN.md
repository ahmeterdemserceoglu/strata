# SENİN YAPACAKLARIN — Proje Sahibi Görev Listesi

Bu liste, Strata platformunun çalıştırılması, geliştirilmesi, test edilmesi ve canlıya alınması için proje sahibi (senin) tarafından yapılması gereken dış işleri içerir.

> **Özet:**
> - Toplam Görev Sayısı: 24
> - Yerelde Çalıştırmak İçin Zorunlu: 3
> - Yayından Önce Zorunlu: 13
> - Opsiyonel / Sonra: 8

---

## 1. HEMEN (Yerelde Çalıştırmak İçin)

- [ ] **Gerekli Temel Araçların Kurulumu**
  - **Ne:** Node.js 22 LTS, Docker Desktop ve Git kurulumu.
  - **Neden:** Backend veritabanları (Postgres, Redis, ScyllaDB, LiveKit) konteyner olarak çalışır; TypeScript kodları Node 22 üzerinde derlenir.
  - **Nasıl:** 
    1. [nodejs.org](https://nodejs.org) adresinden v22 LTS yükleyin.
    2. [docker.com](https://www.docker.com/products/docker-desktop/) adresinden Docker Desktop indirip kurun ve başlatın.
  - **Nereye:** Bilgisayarınıza doğrudan kurulur.
  - **Kontrol:** Terminalde `node -v` ve `docker --version` komutları hata vermeden çalışmalıdır.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Geliştirme Ortamı Anahtarlarının Üretilmesi**
  - **Ne:** `.env` dosyasının oluşturulması ve geliştirme anahtarlarının otomatik üretilmesi.
  - **Neden:** JWT imzalama, MFA şifreleme ve LiveKit bağlantıları için yerel kriptografik anahtarlar gereklidir.
  - **Nasıl:** Proje kök dizininde şu komutu çalıştırın:
    ```bash
    pnpm setup:dev
    ```
  - **Nereye:** `.env` dosyasını otomatik oluşturur veya günceller.
  - **Kontrol:** Proje kökünde `.env` dosyası oluşmalı ve `JWT_PRIVATE_KEY`, `MFA_ENCRYPTION_KEY` dolu olmalıdır.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Yerel Altyapı Konteynerlerinin Başlatılması**
  - **Ne:** Docker Compose ile veritabanlarının kaldırılması.
  - **Neden:** API ve Gateway'in bağlanacağı PostgreSQL, ScyllaDB, Redis ve LiveKit servislerini sağlar.
  - **Nasıl:** Terminalde şu komutu çalıştırın:
    ```bash
    docker compose -f infra/docker-compose.dev.yml up -d
    ```
  - **Nereye:** Arka planda Docker konteynerleri olarak çalışır.
  - **Kontrol:** `docker ps` komutunda postgres, redis, scylladb, livekit ve minio konteynerleri `healthy` veya `up` görünmelidir.
  - **Tahmini maliyet:** Ücretsiz.

---

## 2. YAYINDAN ÖNCE (Üretim İçin Zorunlu)

- [ ] **Ses Efekti Dosyalarının Eklenmesi**
  - **Ne:** Uygulama içi bildirim, bağlanma ve konuşma ses dosyalarının eklenmesi.
  - **Neden:** Sesli kanala giriş/çıkış, susturma, arama tonları ve mesaj uyarılarında kullanıcıya sesli geri bildirim vermek için.
  - **Nasıl:** Aşağıdaki ses tablosunda belirtilen 17 dosyayı `.ogg` (Opus) veya `.mp3` formatında temin edip ilgili klasöre kopyalayın. Kaynak için freesound.org veya CC0 ses kütüphanelerini kullanabilirsiniz.
  - **Nereye:** `assets/sounds/` klasörü altına dosya isimleri birebir eşleşecek şekilde.
  - **Kontrol:** Uygulama açılışında konsolda ses uyarısı çıkmamalı ve sesler tıklandığında çalmalıdır.
  - **Tahmini maliyet:** Ücretsiz (CC0) veya lisanslı ses paketi (~$10 - $50).

### Ses Dosyaları Listesi (Bölüm M.4)

| Dosya Adı | Ne Zaman Çalar? | Önerilen Süre | Format |
|---|---|---|---|
| `voice_join.ogg` | Kullanıcı bir ses kanalına bağlandığında | 0.3 - 0.6 sn | Ogg Opus / MP3 |
| `voice_leave.ogg` | Kullanıcı ses kanalından ayrıldığında | 0.3 - 0.5 sn | Ogg Opus / MP3 |
| `user_join.ogg` | Başka bir kullanıcı bulunulan ses kanalına geldiğinde | 0.4 - 0.8 sn | Ogg Opus / MP3 |
| `user_leave.ogg` | Başka bir kullanıcı bulunulan ses kanalından çıktığında | 0.4 - 0.6 sn | Ogg Opus / MP3 |
| `mute.ogg` | Mikrofon susturulduğunda (self-mute) | 0.2 - 0.4 sn | Ogg Opus / MP3 |
| `unmute.ogg` | Mikrofon susturması kaldırıldığında | 0.2 - 0.4 sn | Ogg Opus / MP3 |
| `deafen.ogg` | Sağırlaştırıldığında (kulaklık kapatıldığında) | 0.2 - 0.4 sn | Ogg Opus / MP3 |
| `undeafen.ogg` | Sağırlaştırma kapatıldığında | 0.2 - 0.4 sn | Ogg Opus / MP3 |
| `message.ogg` | İzlenen kanalda yeni mesaj geldiğinde | 0.3 - 0.5 sn | Ogg Opus / MP3 |
| `mention.ogg` | Kullanıcıdan veya rolünden bahsedildiğinde (etiketleme) | 0.4 - 0.7 sn | Ogg Opus / MP3 |
| `incoming_call.ogg` | Biri DM veya gruptan sesli/görüntülü aradığında | Döngüsel (2-4 sn) | Ogg Opus / MP3 |
| `outgoing_call.ogg` | Bir kullanıcı aranırken çalan çalma sesi | Döngüsel (2-3 sn) | Ogg Opus / MP3 |
| `stream_start.ogg` | Ekran veya video yayını başladığında | 0.5 - 1.0 sn | Ogg Opus / MP3 |
| `stream_stop.ogg` | Yayın durdurulduğunda | 0.4 - 0.6 sn | Ogg Opus / MP3 |
| `ptt_on.ogg` | Push-to-talk tuşuna basıldığında | 0.1 - 0.2 sn | Ogg Opus / MP3 |
| `ptt_off.ogg` | Push-to-talk tuşu bırakıldığında | 0.1 - 0.2 sn | Ogg Opus / MP3 |
| `disconnect.ogg` | Bağlantı koptuğunda veya sunucudan atıldığında | 0.5 - 0.8 sn | Ogg Opus / MP3 |

- [ ] **Marka Varlıkları ve İkonların Eklenmesi**
  - **Ne:** Uygulama logosu, favicon, masaüstü ve mobil ikonlarının hazırlanması.
  - **Neden:** Varsayılan geçici monogram yerine gerçek marka kimliğiyle derleme almak için.
  - **Nasıl:** `assets/brand/` klasörüne SVG formatında logo ve gerekli PNG boyutlarını ekleyin.
  - **Nereye:** `assets/brand/` ve `apps/desktop/src-tauri/icons/`.
  - **Kontrol:** Masaüstü penceresi ve web tarayıcı sekmesinde kendi logonuz görünür.
  - **Tahmini maliyet:** Ücretsiz veya grafik tasarımcı bütçesi.

- [ ] **Google OAuth2 Uygulamasının Oluşturulması**
  - **Ne:** Google ile Tek Tıkla Giriş API anahtarlarının alınması.
  - **Neden:** Kullanıcıların şifre oluşturmadan Google hesaplarıyla giriş yapabilmesi için.
  - **Nasıl:**
    1. Google Cloud Console'a gidin -> APIs & Services -> Credentials.
    2. "OAuth client ID" oluşturun (Web Application).
    3. Authorized redirect URI olarak `https://api.strata.chat/api/v1/auth/oauth/google/callback` ekleyin.
  - **Nereye:** `.env` dosyasındaki `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET`.
  - **Kontrol:** Giriş ekranında "Google ile Giriş Yap" butonu aktifleşir ve başarılı giriş yapar.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **GitHub OAuth Uygulamasının Oluşturulması**
  - **Ne:** GitHub ile Giriş anahtarlarının alınması.
  - **Neden:** Geliştiricilerin GitHub hesabı ile giriş yapabilmesi için.
  - **Nasıl:** GitHub Settings -> Developer settings -> OAuth Apps -> New OAuth App. Callback URL: `https://api.strata.chat/api/v1/auth/oauth/github/callback`.
  - **Nereye:** `.env` dosyasındaki `GITHUB_CLIENT_ID` ve `GITHUB_CLIENT_SECRET`.
  - **Kontrol:** Giriş ekranında GitHub butonu görünür ve çalışır.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Üretim E-posta (SMTP) Servisi Kurulumu**
  - **Ne:** E-posta doğrulama ve şifre sıfırlama için SMTP hesabı temini.
  - **Neden:** Gerçek kullanıcılara e-posta gönderebilmek için (geliştirmede Mailpit kullanılır).
  - **Nasıl:** Resend, SendGrid, Postmark veya AWS SES hesabı açın. Domain doğrulaması için DNS'e SPF, DKIM kayıtlarını girin.
  - **Nereye:** `.env` içindeki `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.
  - **Kontrol:** Şifre sıfırlama istendiğinde e-posta gerçek gelen kutunuza düşmelidir.
  - **Tahmini maliyet:** Ayda ilk 1.000-3.000 e-posta ücretsiz; sonrası $10-$20/ay.

- [ ] **S3 Uyumlu Depolama (Cloudflare R2 veya AWS S3)**
  - **Ne:** Dosya, görsel ve profil fotoğraflarının saklanacağı depolama alanı.
  - **Neden:** Geliştirmedeki yerel MinIO yerine dayanıklı, CDN destekli nesne depolama kullanmak.
  - **Nasıl:** Cloudflare R2 veya AWS S3'te bir bucket oluşturun. CORS kurallarını tanımlayın.
  - **Nereye:** `.env` içindeki `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`.
  - **Kontrol:** Resim yüklendiğinde S3 bucket'ında dosya oluşur ve CDN linkinden açılır.
  - **Tahmini maliyet:** Cloudflare R2'de 10 GB depolama ve sınırsız egress ücretsizdir.

- [ ] **Üretim Kriptografik Anahtarlarının Üretilmesi**
  - **Ne:** Canlı ortam Ed25519 JWT anahtar çifti ve AES-256 MFA anahtarı üretimi.
  - **Neden:** Geliştirme anahtarlarının sızma riskini önlemek ve yüksek güvenlik sağlamak.
  - **Nasıl:** Linux/Mac veya Git Bash terminalinde:
    ```bash
    # Ed25519 private key
    openssl genpkey -algorithm ed25519 -outform PEM -out jwt_private.pem
    # AES-256 key (32 hex byte)
    openssl rand -hex 32
    ```
  - **Nereye:** Sunucu ortam değişkenleri (KMS veya Kubernetes Secret: `JWT_PRIVATE_KEY`, `MFA_ENCRYPTION_KEY`).
  - **Kontrol:** Üretim API servisi açılırken anahtar doğrulamasından geçmeli.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Canlı Alan Adı ve DNS Kayıtlarının Yapılandırılması**
  - **Ne:** `strata.chat` (veya seçilen alan adı) DNS ayarları.
  - **Neden:** Web, API, WebSocket Gateway ve LiveKit'in dış dünyaya açılması.
  - **Nasıl:** DNS sağlayıcınızda (Cloudflare vb.):
    - `strata.chat` -> Web uygulaması
    - `api.strata.chat` -> Fastify REST API
    - `gateway.strata.chat` -> uWS WebSocket Gateway
    - `livekit.strata.chat` -> LiveKit SFU (TCP 443 + UDP medya portları)
  - **Nereye:** DNS yönetim paneli.
  - **Kontrol:** `curl -I https://api.strata.chat/health/ready` 200 dönmelidir.
  - **Tahmini maliyet:** Alan adı yıllık ~$10 - $15.

- [ ] **Tauri WebRTC Uyumluluk Testinin Cihazlarda Koşulması**
  - **Ne:** Windows, macOS ve Linux makinelerde WebRTC uyumluluk ekranının açılıp test edilmesi.
  - **Neden:** WebView2 / WKWebView / WebKitGTK üzerinde mikrofon, hoparlör ve ekran paylaşımının donanım seviyesinde doğrulandığından emin olmak.
  - **Nasıl:** Masaüstü uygulamasında Ayarlar -> "WebRTC Uyumluluk Testi" butonuna basın. "Testi Başlat" deyin. Çıkan tablodaki tüm satırların yeşil olduğunu görün ve "Raporu Kopyala" ile saklayın.
  - **Nereye:** `PROJE_DURUMU.md` veya test raporlarına işlenir.
  - **Kontrol:** Mikrofon dalga boyu hareket eder ve ekran paylaşımı önizlemesi çıkar.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Tauri Masaüstü Kod İmzalama Sertifikaları**
  - **Ne:** Windows SmartScreen ve macOS Gatekeeper uyarılarını engellemek için kod imzalama.
  - **Neden:** Kullanıcıların "Bilinmeyen Yayıncı" uyarısı almadan uygulamayı yükleyebilmesi.
  - **Nasıl:** 
    - Windows: Sectigo / DigiCert'ten EV Code Signing veya Azure Trusted Signing sertifikası.
    - macOS: Apple Developer Program ($99/yıl) kaydı ve Developer ID Application sertifikası.
  - **Nereye:** CI/CD ortam değişkenleri (`WINDOWS_CERTIFICATE_FILE`, `APPLE_CERTIFICATE`, `APPLE_ID`).
  - **Kontrol:** İndirilen `.exe` ve `.dmg` dosyaları çift tıklandığında güvenlik uyarısı vermeden açılır.
  - **Tahmini maliyet:** Windows: ~$200 - $400/yıl, Apple: $99/yıl.

- [ ] **Hukuki Metinlerin Hazırlanması**
  - **Ne:** Kullanım Koşulları, Gizlilik Politikası ve KVKK/GDPR Aydınlatma Metni.
  - **Neden:** Yasal zorunluluk ve kullanıcı verilerinin işlenmesi hakkı.
  - **Nasıl:** Bir hukuk uzmanı ile hazırlanan metinleri `apps/web/public/legal/` içine markdown veya HTML olarak yerleştirin.
  - **Nereye:** Web uygulamasındaki `/legal/privacy` ve `/legal/terms` sayfaları.
  - **Kontrol:** Kayıt ekranındaki linklere tıklandığında metinler açılır.
  - **Tahmini maliyet:** Hukuki danışmanlık bütçesine göre.

---

## 3. OPSİYONEL / SONRA

- [ ] **Cloudflare Turnstile Bot Koruması**
  - **Ne:** Kayıt ve giriş ekranlarında bot koruma widget'ı.
  - **Neden:** Sahte hesap açılmasını ve credential stuffing saldırılarını önlemek.
  - **Nasıl:** Cloudflare panelinden Turnstile Site Key ve Secret Key alın.
  - **Nereye:** `.env` içindeki `TURNSTILE_SITE_KEY` ve `TURNSTILE_SECRET_KEY`.
  - **Kontrol:** Giriş ekranında sessiz bot kontrolü gerçekleşir.
  - **Tahmini maliyet:** Ücretsiz.

- [ ] **Sentry Hata Takibi Kurulumu**
  - **Ne:** Frontend ve backend hatalarını anlık izleyen Sentry projesi.
  - **Neden:** Canlıda kullanıcıların karşılaştığı hataları kod satırına kadar tespit etmek.
  - **Nasıl:** sentry.io adresinden hesap açıp React, Node.js ve Tauri için DSN anahtarı alın.
  - **Nereye:** `.env` dosyasındaki `SENTRY_DSN` değişkeni.
  - **Kontrol:** Bir test hatası fırlatıldığında Sentry panosuna düşer.
  - **Tahmini maliyet:** Ücretsiz plan (aylık 5.000 hata sınırı).

- [ ] **Expo EAS Mobil Build ve Bildirim Kurulumu**
  - **Ne:** iOS APNs ve Android FCM push bildirim entegrasyonu.
  - **Neden:** Mobil kullanıcıların uygulama kapalıyken mention ve arama bildirimi alması.
  - **Nasıl:** expo.dev hesabı açın. Apple Developer APNs p8 anahtarı ve Firebase `google-services.json` dosyasını EAS'a yükleyin.
  - **Nereye:** `apps/mobile/eas.json` ve Expo Proje Paneli.
  - **Kontrol:** Test telefonuna push bildirimi gönderilir.
  - **Tahmini maliyet:** Expo ücretsiz; Apple Developer hesabı ($99/yıl) gerekir.

- [ ] **Büyük Ölçekli Dağıtık Yük Testinin Koşulması**
  - **Ne:** 5.000+ eşzamanlı WebSocket bağlantısı ve mesaj yük testi.
  - **Neden:** Üretim sunucularının CPU, bellek ve fan-out gecikmesini gerçek yük altında doğrulamak.
  - **Nasıl:** `scripts/load-test/` altındaki k6 ve WS betiklerini çoklu sanal sunuculardan çalıştırın.
  - **Nereye:** Grafana metrik panoları.
  - **Kontrol:** p95 mesaj gecikmesi < 150 ms kalmalıdır.
  - **Tahmini maliyet:** Test süresince kiralanan 2-3 adet cloud instance (~$10).

---

## Sık Karşılaşılan Sorunlar (SSS)

1. **Docker servisleri başlamıyor:**
   - Docker Desktop uygulamasının çalıştığından ve WSL2 (Windows için) motorunun aktif olduğundan emin olun.
2. **Ses efektleri çalmıyor:**
   - Dosya adlarının küçük harfle ve `.ogg` uzantılı olduğunu kontrol edin (ör. `voice_join.ogg`). Dosya yoksa sistem sessizce atlar, hata fırlatmaz.
3. **Masaüstünde mikrofon sesi iletilmiyor:**
   - Ayarlar -> "Ses Motoru" seçeneğini kontrol edin. Windows'ta varsayılan "WebVoiceEngine" (WebView2 WebRTC) olmalıdır.
