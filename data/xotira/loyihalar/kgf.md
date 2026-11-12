# Kokand Gold Future (KGF) Guruhi Pasporti

* **Mas'ul Agent:** Debra 🗂 (Boshliq / Detektor)
* **Status:** Faol ishlab turibdi

---

## 1. Loyihalar Tarkibi

### 1.1. KGF Veb-sayti
* **Kalit:** `kgf-web`
* **Veb-manzil:** `https://kokandgoldfuture.uz`
* **Konteyner:** `zavod-hr-web-1` (Docker)
* **Vazifasi:** Zavodning asosiy korporativ va HR portali.

### 1.2. KGF Resume Boti
* **Kalit:** `c-resume`
* **Telegram:** `@kgfhr_bot`
* **Konteyner:** `kgf-resume-bot` (Docker)
* **Vazifasi:** Ishga kiruvchi nomzodlardan rezyume va anketalar yig'ish.

### 1.3. Kunlik Hisobot Boti
* **Kalit:** `c-hisobot`
* **Telegram:** `@Hisobotgoldfuturebot`
* **Konteyner:** `hisobot-kunlik-bot` (Docker)
* **Vazifasi:** Zavodning kunlik ishlab chiqarish va ish faoliyati hisobotlarini yig'ish.

### 1.4. YuzNazorat Paneli (FaceID)
* **Kalit:** `yuznazorat`
* **Manzil:** `http://45.92.173.191:4100/`
* **Holat:** Parol bilan himoyalangan (401 - bu sog'lom javob).
* **Vazifasi:** Xodimlarning keldi-ketdisini FaceID orqali nazorat qilish.

---

## 2. Infratuzilma Bog'liqligi
* Baza: `c-kgf-db` (PostgreSQL) — Layla nazoratida.
* Pochta: `c-kgf-mail` (Mail worker) — Layla nazoratida.

## 3. Mas'ul Debra'ning Vazifalari
1. KGF sayti va botlarining doimiy javob berishini nazorat qilish.
2. Resume va hisobot botlari qotib qolmasligini ta'minlash.
3. 08:30 da KGF tizimlari bo'yicha yig'ma holatni Dexterga taqdim etish.

---

## 4. Loyiha Bo'yicha Takliflar va Rivojlantirish Rejasi
1. **Rezyumelarni AI orqali avtomatik tahlil qilish:** `@kgfhr_bot` orqali yuborilgan nomzod rezyumelarini (PDF/DOCX) avtomatik o'qib, asosiy ko'nikmalari va tajribasini saralab, HR menejeriga xulosa berish.
2. **YuzNazorat panelini Caddy orqali HTTPS ga o'tkazish:** Hozirgi ochiq `http://45.92.173.191:4100/` manzilini Caddy orqali xavfsiz domen ostiga olish (`https://yuz.kokandgoldfuture.uz`), 4100-portni esa faqat lokal tarmoq uchun qoldirish.
3. **Hisobot botiga avto-eslatma:** Kunlik hisobot yubormagan mas'ul xodimlarga har kuni soat 18:30 da eslatuvchi avto-xabar yuborish.
