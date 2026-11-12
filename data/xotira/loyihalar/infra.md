# Infratuzilma (INFRA) va To'lovlar Pasporti

* **Mas'ul Agent:** Layla 🏗️💳 (Infratuzilma va To'lovlar nazorati)
* **Status:** Doimiy monitoring

---

## 1. Asosiy Server va Tarmoq (Reverse Proxy)

### 1.1. Asosiy VPS Server
* **Server IP:** `45.92.173.191` (vps12090.eskiz.uz, Eskiz.uz)
* **OS:** Ubuntu 24.04 LTS (2 vCPU, 4 GB RAM, 80 GB SSD)
* **Kuzatuv:** Disk (foiz/bo'sh GB), RAM, Swap, CPU yuki.

### 1.2. Caddy Kirish Shlyuzi (Reverse Proxy)
* **Kalit:** `c-caddy`
* **Konteyner:** `xarajat-caddy-1` (Docker)
* **Portlar:** 80 (HTTP) va 443 (HTTPS)
* **Vazifasi:** Barcha tashqi so'rovlarni qabul qilib, tegishli konteyner va portlarga uzatadi, avtomatik Let's Encrypt SSL sertifikatlarini boshqaradi.
* **⚠️ Diqqat:** Agar Caddy yiqilsa, barcha veb-saytlar tashqaridan ochilmay qoladi!

---

## 2. Umumiy Xizmatlar (Docker & Baza)

### 2.1. Ma'lumotlar bazasi (PostgreSQL)
* **Kalit:** `c-kgf-db`
* **Konteyner:** `zavod-hr-db-1` (Docker)
* **Vazifasi:** KGF, HR va hisobotlar bazasi.

### 2.2. Pochta va Xabarlar Xizmati
* **Kalit:** `c-kgf-mail`
* **Konteyner:** `zavod-hr-mail-worker-1` (Docker)

### 2.3. Xarajat Ilovasi Serveri
* **Kalit:** `c-xarajat` (App) / `xarajat-web`
* **Konteyner:** `xarajat-app-1` (Docker)
* **Manzil:** `https://45-92-173-191.sslip.io`

---

## 3. To'lovlar va Obunalar Taqsimoti

| Obuna | Kuni | Summa | Keyingi sana |
|---|---|---|---|
| **7007 raqami to'lovi** | Har oy 14-sanada | 70 000 so'm | 2026-11-14 |
| **Uydagi Wi-Fi to'lovi** | Har oy 18-sanada | 200 000 so'm | 2026-11-18 |
| **VPS server obunasi** | Har oy 28-sanada | 200 000 so'm | 2026-11-28 |
| **Claude AI Pro** | Har oy 9-sanada | $20 (MB kursi bo'yicha) | 2026-12-09 |

---

## 4. Mas'ul Layla'ning Vazifalari
1. Caddy shlyuzi, PostgreSQL bazasi va Docker xizmatlari holatini kuzatish.
2. Server xotirasi (disk va RAM) to'lib qolmasligini oldindan aniqlash.
3. To'lovlarga 3 kun, 1 kun qolganda va to'lov kuni eslatish.
4. Har kuni 08:15 da Debraga infratuzilma va to'lovlar xulosasini topshirish.

---

## 5. Loyiha Bo'yicha Takliflar va Rivojlantirish Rejasi
1. **Docker loglari hajmini cheklash:** Server diski (SSD) tez to'lib qolmasligi uchun barcha Docker konteynerlariga `max-size: 50m, max-file: 3` qoidasini qo'llash.
2. **PostgreSQL optimallashtirish:** Har hafta yakshanba kechasi `VACUUM ANALYZE` o'tkazish orqali ma'lumotlar bazasi so'rovlari tezligini yuqori ushlab turish.
3. **To'lovlar uchun zaxira balans:** Har oy boshida obunalar uchun umumiy oylik xarajat hisoblanib, plastik kartada yetarli mablag' borligi 3 kun oldin eslatilishi.
